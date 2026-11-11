/**
 * Export-vs-preview parity probe (bug-fix regression, DEV-only). Exercises the
 * REAL PNG-sequence export path (worker when available) and compares the decoded
 * frame at `t` against the preview FrameRenderer render at the same time, both
 * composited over opaque white. Returns the diffRatio (fraction of pixels
 * differing by > 24/255 on any channel) so a test can assert export/preview
 * parity survives font loading. Lives in the app module graph so the bundler
 * resolves @studio/exporters and the FrameRenderer.
 */
import type { Project } from "@studio/engine";
import { exportPngSequence } from "@studio/exporters";
import { makePreviewRenderer, drawPreviewFrame } from "./draw.js";
import { loadBundledFontBytes } from "../fonts/fonts.js";

const LOCAL_SIG = 0x04034b50;
const CD_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

function u16(view: DataView, p: number): number {
  return view.getUint16(p, true);
}
function u32(view: DataView, p: number): number {
  return view.getUint32(p, true);
}

/**
 * Reads the STORED (uncompressed) bytes of the ZIP entry named `name`, via the
 * central directory (authoritative offsets + sizes). `client-zip` writes a data
 * descriptor, so the local header's compressed-size field is 0 and sequential
 * local-header walking is unreliable — the central directory is the source of
 * truth. No ZIP64, no deflate (the exporter writes small STORED archives).
 */
function readStoredEntryByName(zip: Uint8Array, name: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Find the End Of Central Directory record (scan back; comment is empty).
  let eocd = -1;
  for (let p = zip.byteLength - 22; p >= 0; p--) {
    if (u32(view, p) === EOCD_SIG) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new Error("no EOCD record");

  const total = u16(view, eocd + 10);
  let cd = u32(view, eocd + 16);
  const dec = new TextDecoder();

  for (let i = 0; i < total; i++) {
    if (u32(view, cd) !== CD_SIG) throw new Error("bad central directory header");
    const method = u16(view, cd + 10);
    const uncompressedSize = u32(view, cd + 24);
    const nameLen = u16(view, cd + 28);
    const extraLen = u16(view, cd + 30);
    const commentLen = u16(view, cd + 32);
    const lho = u32(view, cd + 42);
    const entryName = dec.decode(zip.subarray(cd + 46, cd + 46 + nameLen));
    if (entryName === name) {
      if (method !== 0) throw new Error(`entry ${name} is deflated, expected STORED`);
      if (u32(view, lho) !== LOCAL_SIG) throw new Error("bad local file header");
      const lNameLen = u16(view, lho + 26);
      const lExtraLen = u16(view, lho + 28);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      return zip.subarray(dataStart, dataStart + uncompressedSize);
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry ${name} not found`);
}

/**
 * The exporter's entry name for frame `index` of `total` frames: `frame_` + a
 * zero-padded index (>= 4 digits, widening past 9999) + `.png`. Mirrors
 * `frameFileName` in the exporter so the probe can pick a specific frame.
 */
function frameFileName(index: number, total: number): string {
  const width = Math.max(4, String(Math.max(1, total) - 1).length);
  return `frame_${String(index).padStart(width, "0")}.png`;
}

/** Composites an image source over opaque white and returns its RGBA bytes. */
function compositeOverWhite(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, w, h);
  cx.drawImage(src, 0, 0);
  return cx.getImageData(0, 0, w, h).data;
}

/**
 * Exports `project` as a PNG sequence (the real export path), decodes the frame
 * nearest `tSeconds`, and compares it to the preview render at that frame time.
 * Returns the diffRatio. Resolves to 1 (max difference) on any failure so the
 * caller's `<= tolerance` assertion fails loudly rather than silently passing.
 */
export async function runExportParity(project: Project, tSeconds: number): Promise<number> {
  const { width: w, height: h, fps, durationSeconds } = project.canvas;
  const frameCount = Math.max(1, Math.round(fps * durationSeconds));
  const frameIndex = Math.min(frameCount - 1, Math.max(0, Math.round(tSeconds * fps)));
  const frameTime = frameIndex / fps;

  // Same fonts the dialog passes, so the Worker path measures with the real faces.
  const fontBytes = await loadBundledFontBytes();
  if (!fontBytes.ok) return 1;
  const result = await exportPngSequence(project, { fonts: fontBytes.fonts });
  if (!result.ok) return 1;

  const zip = new Uint8Array(await result.file.arrayBuffer());
  let pngBytes: Uint8Array;
  try {
    pngBytes = readStoredEntryByName(zip, frameFileName(frameIndex, frameCount));
  } catch {
    return 1;
  }

  const bitmap = await createImageBitmap(new Blob([pngBytes.slice()], { type: "image/png" }));

  const prev = document.createElement("canvas");
  prev.width = w;
  prev.height = h;
  const pctx = prev.getContext("2d")!;
  const renderer = makePreviewRenderer(project);
  drawPreviewFrame(renderer, pctx, project, frameTime);

  const a = compositeOverWhite(prev, w, h);
  const b = compositeOverWhite(bitmap, w, h);
  bitmap.close();

  const total = w * h;
  let differing = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (
      Math.abs(a[o] - b[o]) > 24 ||
      Math.abs(a[o + 1] - b[o + 1]) > 24 ||
      Math.abs(a[o + 2] - b[o + 2]) > 24
    ) {
      differing++;
    }
  }
  return differing / total;
}
