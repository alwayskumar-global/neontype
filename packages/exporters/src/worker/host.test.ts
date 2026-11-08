/**
 * Unit tests for the export loop (Task 3.2) using mocked encoders.
 *
 * Every mock is a SELF-CONTAINED object with real getters (never built by
 * spread-overriding getters, which silently copies a getter's current value
 * rather than the getter). Each test asserts behavior that would FAIL if the
 * production guard it covers were removed (see the per-test comments).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { runExport, type ExportEncoder, type RunExportArgs } from "./host.js";
import { DEFAULT_LIMITS, type ExportProgress } from "../types.js";

/** Mutable state + a self-contained `ExportEncoder` over it. */
interface MockState {
  encoded: number[];
  released: boolean;
  finalizeCalled: boolean;
  drainCalls: number;
  queue: number;
  bytes: number;
  /** The largest `encodeQueueSize` observed at the moment `encode` ran. */
  maxQueueAtEncode: number;
}

interface MockConfig {
  /** Each encode increments the in-flight queue by this (default 0). */
  queuePerEncode?: number;
  /** `drainBelow` resets the queue to `max - 1` when true (default true). */
  drainResets?: boolean;
  /** Constant bytesHeld to report (default 0). */
  bytes?: number;
  /** When set, `encode` throws an error with this name. */
  throwOnEncode?: string;
}

function makeMock(config: MockConfig = {}): { enc: ExportEncoder; state: MockState } {
  const state: MockState = {
    encoded: [],
    released: false,
    finalizeCalled: false,
    drainCalls: 0,
    queue: 0,
    bytes: config.bytes ?? 0,
    maxQueueAtEncode: 0,
  };
  const queuePerEncode = config.queuePerEncode ?? 0;
  const drainResets = config.drainResets ?? true;

  const enc: ExportEncoder = {
    get encodeQueueSize() {
      return state.queue;
    },
    get bytesHeld() {
      return state.bytes;
    },
    encode(index: number) {
      state.maxQueueAtEncode = Math.max(state.maxQueueAtEncode, state.queue);
      if (config.throwOnEncode !== undefined) {
        const e = new Error("boom");
        e.name = config.throwOnEncode;
        throw e;
      }
      state.encoded.push(index);
      state.queue += queuePerEncode;
    },
    async drainBelow(max: number) {
      state.drainCalls += 1;
      if (drainResets) state.queue = max - 1;
    },
    async finalize() {
      state.finalizeCalled = true;
      return { file: new Blob([new Uint8Array([1, 2, 3])]), fileName: "out.bin", byteSize: 3 };
    },
    release() {
      state.released = true;
    },
  };
  return { enc, state };
}

function baseArgs(encoder: ExportEncoder, over: Partial<RunExportArgs> = {}): RunExportArgs {
  return {
    format: "mp4",
    frameCount: 5,
    width: 320,
    height: 240,
    fps: 30,
    limits: DEFAULT_LIMITS,
    encoder,
    isAborted: () => false,
    ...over,
  };
}

describe("runExport — success + progress", () => {
  it("encodes every frame, finalizes, and reports final fraction exactly 1", async () => {
    const { enc, state } = makeMock();
    const progress: ExportProgress[] = [];
    const r = await runExport(baseArgs(enc, { onProgress: (p) => progress.push(p) }));
    expect(r.ok).toBe(true);
    expect(state.encoded).toEqual([0, 1, 2, 3, 4]);
    expect(state.finalizeCalled).toBe(true);
    expect(state.released).toBe(true);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].fraction).toBeGreaterThanOrEqual(progress[i - 1].fraction);
    }
    const last = progress[progress.length - 1];
    expect(last.fraction).toBe(1);
    expect(last.frame).toBe(4);
    expect(last.frameCount).toBe(5);
  });
});

describe("runExport — cancel", () => {
  it("returns cancelled, never finalizes, releases, and does not encode all frames", async () => {
    // Mutation guard: if the abort check were removed, the loop would encode all
    // 5 frames and call finalize() → finalizeCalled true and ok true. We assert
    // the opposite, so removing the guard fails this test.
    const { enc, state } = makeMock();
    let calls = 0;
    const r = await runExport(baseArgs(enc, { isAborted: () => ++calls > 2 }));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.code).toBe("cancelled");
    expect(state.finalizeCalled).toBe(false);
    expect(state.released).toBe(true);
    expect(state.encoded.length).toBeLessThan(5);
  });
});

describe("runExport — backpressure", () => {
  it("never lets the observed queue exceed the bound and waits on drain at least once", async () => {
    // Mutation guard: if the `encodeQueueSize >= max` drain were removed, the
    // queue would grow unbounded (maxQueueAtEncode > limit) and drainCalls === 0.
    const { enc, state } = makeMock({ queuePerEncode: 1, drainResets: true });
    const limits = { ...DEFAULT_LIMITS, maxEncodeQueueSize: 2 };
    const r = await runExport(baseArgs(enc, { frameCount: 10, limits }));
    expect(r.ok).toBe(true);
    expect(state.released).toBe(true);
    // Drain was actually invoked (backpressure engaged).
    expect(state.drainCalls).toBeGreaterThan(0);
    // The queue observed at encode time never exceeded the configured bound.
    expect(state.maxQueueAtEncode).toBeLessThanOrEqual(limits.maxEncodeQueueSize);
  });
});

describe("runExport — memory budget", () => {
  it("returns out-of-memory, never finalizes, and releases when over budget", async () => {
    // Mutation guard: if the bytesHeld > budget check were removed, the export
    // would finalize and return ok. We assert out-of-memory + no finalize.
    const { enc, state } = makeMock({ bytes: 2 * 1024 * 1024 * 1024 }); // 2 GiB > 1.5 GiB
    const r = await runExport(baseArgs(enc));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.code).toBe("out-of-memory");
    expect(state.finalizeCalled).toBe(false);
    expect(state.released).toBe(true);
  });
});

describe("runExport — encoder failure", () => {
  it("maps an encoder throw to encoder-failure, never finalizes, and releases", async () => {
    // Mutation guard: if the try/catch were removed, the throw would propagate
    // and this test would error instead of receiving an encoder-failure result.
    const { enc, state } = makeMock({ throwOnEncode: "EncodingError" });
    const r = await runExport(baseArgs(enc));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.code).toBe("encoder-failure");
    expect(state.finalizeCalled).toBe(false);
    expect(state.released).toBe(true);
  });
});

/* ----------------------------- Property tests ----------------------------- */

// Feature: exporters, Property 10: Progress is monotonic and final-exact
describe("Property 10: Progress is monotonic and final-exact", () => {
  it("non-decreasing fractions; final fraction exactly 1 with frame frameCount-1", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 300 }), async (frameCount) => {
        const { enc } = makeMock();
        const progress: ExportProgress[] = [];
        const r = await runExport(baseArgs(enc, { frameCount, onProgress: (p) => progress.push(p) }));
        expect(r.ok).toBe(true);
        expect(progress.length).toBeGreaterThan(0);
        for (let i = 1; i < progress.length; i++) {
          expect(progress[i].fraction).toBeGreaterThanOrEqual(progress[i - 1].fraction);
          expect(progress[i].fraction).toBeGreaterThanOrEqual(0);
          expect(progress[i].fraction).toBeLessThanOrEqual(1);
        }
        const last = progress[progress.length - 1];
        expect(last.fraction).toBe(1);
        expect(last.frame).toBe(frameCount - 1);
        expect(last.frameCount).toBe(frameCount);
      }),
      { numRuns: 100 },
    );
  });
});
