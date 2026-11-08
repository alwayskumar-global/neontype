/**
 * Export orchestration shared by the worker and the main-thread fallback
 * (Req 9). The same loop runs in both paths, so output is byte-identical
 * (Req 9.8). `runExport` is encoder-agnostic: each format injects an
 * `ExportEncoder`, so the loop here owns progress, cancellation, backpressure,
 * and the memory budget uniformly.
 *
 * No wall-clock is read here; progress and ordering derive only from the frame
 * index and the injected encoder's queue depth.
 */

import type { ExportResult, ExportLimits, ExportProgress, ExportFormat } from "../types.js";
import { fail, succeed } from "../errors.js";

/** The encoder contract a format supplies to the loop. */
export interface ExportEncoder {
  /** In-flight encode operations; the loop keeps this under the bound. */
  readonly encodeQueueSize: number;
  /** Approximate in-memory bytes held so far (for the memory budget). */
  readonly bytesHeld: number;
  /** Encodes one frame at `index`. May be async (awaited by the loop). */
  encode(index: number): Promise<void> | void;
  /** Waits until `encodeQueueSize` drops below `max` (backpressure). */
  drainBelow(max: number): Promise<void>;
  /** Finishes encoding + muxing and returns the file + byte size. */
  finalize(): Promise<{ file: Blob; fileName: string; byteSize: number }>;
  /** Releases all encoders and buffers (on success, cancel, or error). */
  release(): void;
}

/** Inputs to the export loop. */
export interface RunExportArgs {
  format: ExportFormat;
  frameCount: number;
  width: number;
  height: number;
  fps: number;
  limits: ExportLimits;
  encoder: ExportEncoder;
  /** True once the caller has aborted (checked at each frame boundary). */
  isAborted: () => boolean;
  onProgress?: (p: ExportProgress) => void;
  /** Notes to attach to a successful summary (e.g. mp4-no-transparency). */
  notes?: import("../errors.js").ExportNote[];
  /**
   * Optional cooperative yield run once per frame BEFORE the abort check. The
   * worker passes a macrotask yield so a posted `abort` message is delivered
   * between frames (otherwise the synchronous loop would never see it). The
   * main-thread and unit-test paths omit it (no behavioural change).
   */
  yieldControl?: () => Promise<void>;
}

/**
 * Runs the deterministic export loop. Emits progress once per encoded frame
 * (monotonic; final fraction exactly 1), checks abort at each frame boundary
 * (returns `cancelled` within one frame-encode step), bounds the encoder queue
 * to `maxEncodeQueueSize`, and stops with `out-of-memory` if the budget is
 * exceeded. Always releases the encoder. Never throws — maps any encoder throw
 * to `encoder-failure`.
 */
export async function runExport(args: RunExportArgs): Promise<ExportResult> {
  const { encoder, frameCount, limits, isAborted, onProgress, yieldControl } = args;
  try {
    for (let index = 0; index < frameCount; index++) {
      if (yieldControl) await yieldControl();
      if (isAborted()) {
        encoder.release();
        return fail("cancelled", "Export was cancelled.");
      }
      // Backpressure: never let the in-flight queue exceed the bound.
      if (encoder.encodeQueueSize >= limits.maxEncodeQueueSize) {
        await encoder.drainBelow(limits.maxEncodeQueueSize);
      }
      // Memory budget.
      if (encoder.bytesHeld > limits.memoryBudgetBytes) {
        encoder.release();
        return fail("out-of-memory", "Export exceeded the memory budget.");
      }
      await encoder.encode(index);
      onProgress?.({
        fraction: (index + 1) / frameCount,
        frame: index,
        frameCount,
      });
    }

    if (isAborted()) {
      encoder.release();
      return fail("cancelled", "Export was cancelled.");
    }

    const { file, fileName, byteSize } = await encoder.finalize();
    encoder.release();
    // Ensure the final progress fraction is exactly 1 (Req 9.3).
    onProgress?.({ fraction: 1, frame: frameCount - 1, frameCount });
    return succeed({
      format: args.format,
      file,
      fileName,
      summary: {
        width: args.width,
        height: args.height,
        fps: args.fps,
        frameCount,
        byteSize,
        notes: args.notes ?? [],
      },
    });
  } catch (err) {
    encoder.release();
    const message = err instanceof Error ? err.name : "encoder error";
    return fail("encoder-failure", `Encoding failed: ${message}`);
  }
}
