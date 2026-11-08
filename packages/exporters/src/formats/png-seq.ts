/**
 * PNG sequence (ZIP) exporter (Req 4, Req 12).
 *
 * Renders `round(fps * durationSeconds)` frames (minimum 1) through the shared
 * `FrameRenderer` (so blur + scaling match every other path), encodes each as a
 * PNG via `OffscreenCanvas.convertToBlob('image/png')`, and packages them into a
 * single ZIP of STORED (uncompressed) entries via `client-zip`, which carries a
 * CRC-32 per entry. Entry names are zero-padded to at least 4 digits (widening
 * past 9999) so lexical order matches frame order. No video codec is required.
 * Any frame-encode or assembly failure aborts WITHOUT a partial ZIP. Alpha is
 * preserved for a transparent background; an opaque hex background is filled.
 *
 * This module never calls the engine's `renderFrame` directly (Req 8/14 go
 * through `FrameRenderer`).
 */

import { ProjectSchema, type Project } from "@studio/engine";
import { makeZip } from "client-zip";

import type { ExportResult, PngSequenceOptions, ExportLimits } from "../types.js";
import { fail } from "../errors.js";
import { DEFAULT_LIMITS } from "../types.js";
import { frameCountFor, validateFrameRange } from "../frame-stepper.js";
import { validateLimits } from "../validate.js";
import { resolveScalePlan, isScalePlan } from "../scale.js";
import { FrameRenderer } from "../render-frame.js";

/**
 * The zero-padded entry name for frame `index` of `total` frames: at least 4
 * digits, widening when `total` needs more (e.g. 12000 frames -> 5 digits), so
 * lexical sort equals numeric order across the whole sequence.
 */
export function frameFileName(index: number, total: number): string {
  const width = Math.max(4, String(Math.max(1, total) - 1).length);
  return `frame_${String(index).padStart(width, "0")}.png`;
}

/** Collects an async-iterable ZIP stream into a single Uint8Array. */
async function collectZip(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/**
 * Exports a PNG sequence ZIP. `project` is validated with the engine schema.
 * The caller's `onProgress`/`signal` are provided by the host. Never throws.
 */
export async function runPngSequenceExport(
  project: Project,
  options: PngSequenceOptions,
  onProgress: (fraction: number, frame: number, frameCount: number) => void,
  isAborted: () => boolean,
): Promise<ExportResult> {
  const parsed = ProjectSchema.safeParse(project);
  if (!parsed.success) {
    return fail("project-invalid", "Project failed schema validation.", ["project"]);
  }
  const proj = parsed.data;

  const { fps, durationSeconds } = proj.canvas;
  const rangeError = validateFrameRange(durationSeconds, fps);
  if (rangeError) return rangeError;
  const frameCount = frameCountFor(durationSeconds, fps);

  const planOrError = resolveScalePlan(proj.canvas, options.output);
  if (!isScalePlan(planOrError)) return planOrError;
  const plan = planOrError;
  const width = plan.outputWidth;
  const height = plan.outputHeight;

  const limits: ExportLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const limitError = validateLimits({ durationSeconds, frameCount, width, height }, limits);
  if (limitError) return limitError;

  if (typeof OffscreenCanvas === "undefined") {
    return fail("browser-unsupported", "PNG sequence export requires OffscreenCanvas.");
  }

  const renderer = new FrameRenderer(plan);
  const out = new OffscreenCanvas(width, height);
  const outCtx = out.getContext("2d")!;

  // Encode every PNG first; only assemble the ZIP if all frames succeeded, so a
  // failure leaves no partial ZIP (Req 4.6).
  const entries: { name: string; input: ArrayBuffer }[] = [];
  try {
    for (let index = 0; index < frameCount; index++) {
      if (isAborted()) return fail("cancelled", "Export was cancelled.");
      renderer.render(proj, index / fps, outCtx);
      const blob = await out.convertToBlob({ type: "image/png" });
      const buf = await blob.arrayBuffer();
      entries.push({ name: frameFileName(index, frameCount), input: buf });
      onProgress((index + 1) / frameCount, index, frameCount);
    }
  } catch {
    return fail("encoder-failure", "A frame failed to encode; no ZIP was produced.");
  }

  let zipBytes: Uint8Array;
  try {
    // STORED entries (client-zip does not compress), each with a CRC-32.
    zipBytes = await collectZip(makeZip(entries));
  } catch {
    return fail("encoder-failure", "ZIP assembly failed; no ZIP was produced.");
  }

  const ab = zipBytes.slice().buffer;
  const file = new Blob([ab], { type: "application/zip" });
  return {
    ok: true,
    format: "png-sequence",
    file,
    fileName: "frames.zip",
    summary: { width, height, fps, frameCount, byteSize: zipBytes.byteLength, notes: [] },
  };
}
