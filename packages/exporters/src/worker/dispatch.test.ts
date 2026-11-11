import { describe, it, expect, afterEach, vi } from "vitest";

import { dispatchExport } from "./dispatch.js";
import { registerDriver } from "./driver.js";
import { DEFAULT_LIMITS, type ExportResult } from "../types.js";
import type { Project } from "../types.js";

/**
 * Dispatch-level tests with a fake Worker: the `fonts-unsupported` fallback, PCM
 * cloning vs transfer, and font buffers never being transferred (Req 15).
 */

interface Posted { message: { type: string }; transfer: Transferable[] }

class FakeWorker {
  static last: FakeWorker | undefined;
  static reply: "fonts-unsupported" | "result" = "result";
  static terminated = 0;
  posted: Posted[] = [];
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor() { FakeWorker.last = this; }
  addEventListener(type: string, cb: (e: unknown) => void): void { (this.listeners[type] ??= []).push(cb); }
  postMessage(message: { type: string }, transfer: Transferable[] = []): void {
    this.posted.push({ message, transfer });
    if (message.type !== "start") return;
    queueMicrotask(() => {
      const data = FakeWorker.reply === "fonts-unsupported"
        ? { type: "fonts-unsupported" }
        : { type: "result", result: { ok: true } };
      for (const cb of this.listeners["message"] ?? []) cb({ data });
    });
  }
  terminate(): void { FakeWorker.terminated += 1; }
}

const project = {} as unknown as Project;
const okResult = { ok: true, format: "gif", file: new Blob([]), fileName: "x", summary: {} } as unknown as ExportResult;

function install(): void {
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  FakeWorker.last = undefined;
  FakeWorker.terminated = 0;
}

afterEach(() => vi.unstubAllGlobals());

describe("dispatchExport fonts", () => {
  it("on fonts-unsupported terminates the worker and reruns the driver on the main thread with the same options", async () => {
    install();
    FakeWorker.reply = "fonts-unsupported";
    const seen: unknown[] = [];
    registerDriver("fonts-dispatch-test", async (args) => { seen.push(args.options); return okResult; });
    // No FontFace/document.fonts under Node: the main-thread run itself reports font-not-ready,
    // so give the fallback a supported environment.
    const added: string[] = [];
    vi.stubGlobal("fonts", {
      add: (f: { family: string }) => added.push(`add:${f.family}`),
      delete: (f: { family: string }) => added.push(`del:${f.family}`),
      forEach: () => undefined,
    });
    vi.stubGlobal("FontFace", class {
      status = "unloaded";
      constructor(public family: string, _d: ArrayBuffer, o: { weight: string }) { void o; }
      load() { this.status = "loaded"; return Promise.resolve(this); }
      get weight() { return "400"; }
    });
    const fonts = [{ family: "A", weight: 400, data: new ArrayBuffer(4) }];
    const r = await dispatchExport({ driverId: "fonts-dispatch-test", format: "gif", project, options: { fonts }, limits: DEFAULT_LIMITS });
    expect(r).toBe(okResult);
    expect(FakeWorker.terminated).toBe(1);
    expect((seen[0] as { fonts: unknown }).fonts).toBe(fonts);
    expect(added).toEqual(["add:A", "del:A"]); // registered, then released after the main-thread run
  });

  it("clones PCM and never transfers font buffers when fonts are non-empty", async () => {
    install();
    FakeWorker.reply = "result";
    const pcm = { channels: [new Float32Array(4)], sampleRate: 48000, length: 4 };
    const fonts = [{ family: "A", weight: 400, data: new ArrayBuffer(4) }];
    await dispatchExport({ driverId: "none", format: "mp4", project, options: { fonts, audioPcm: pcm }, limits: DEFAULT_LIMITS });
    expect(FakeWorker.last!.posted[0].transfer).toEqual([]);
    expect(pcm.channels[0].buffer.byteLength).toBe(16); // not detached
    expect(fonts[0].data.byteLength).toBe(4);
  });

  it("still transfers PCM when fonts are empty or omitted", async () => {
    install();
    FakeWorker.reply = "result";
    const pcm = { channels: [new Float32Array(4)], sampleRate: 48000, length: 4 };
    await dispatchExport({ driverId: "none", format: "mp4", project, options: { audioPcm: pcm }, limits: DEFAULT_LIMITS });
    expect(FakeWorker.last!.posted[0].transfer).toHaveLength(1);
  });

  it("keeps the audio intact for the fallback after fonts-unsupported", async () => {
    install();
    FakeWorker.reply = "fonts-unsupported";
    let seenLen = -1;
    registerDriver("fonts-audio-test", async (args) => { seenLen = args.options.audioPcm?.channels[0].length ?? -1; return okResult; });
    vi.stubGlobal("fonts", { add: () => undefined, delete: () => undefined, forEach: () => undefined });
    vi.stubGlobal("FontFace", class { status = "unloaded"; weight = "400"; constructor(public family: string) {} load() { this.status = "loaded"; return Promise.resolve(this); } });
    const pcm = { channels: [new Float32Array(8)], sampleRate: 48000, length: 8 };
    await dispatchExport({ driverId: "fonts-audio-test", format: "mp4", project, options: { fonts: [{ family: "A", weight: 400, data: new ArrayBuffer(4) }], audioPcm: pcm }, limits: DEFAULT_LIMITS });
    expect(seenLen).toBe(8);
  });

  it("releases the faces it added when the driver fails or throws on the main thread", async () => {
    vi.stubGlobal("Worker", undefined);
    const log: string[] = [];
    vi.stubGlobal("fonts", {
      add: (f: { family: string }) => log.push("add:" + f.family),
      delete: (f: { family: string }) => log.push("del:" + f.family),
      forEach: () => undefined,
    });
    vi.stubGlobal("FontFace", class { status = "unloaded"; weight = "400"; constructor(public family: string) {} load() { this.status = "loaded"; return Promise.resolve(this); } });
    const fonts = [{ family: "A", weight: 400, data: new ArrayBuffer(4) }];
    registerDriver("fonts-throw-test", async () => { throw new Error("boom"); });
    const thrown = await dispatchExport({ driverId: "fonts-throw-test", format: "gif", project, options: { fonts }, limits: DEFAULT_LIMITS });
    expect(!thrown.ok && thrown.error.code).toBe("encoder-failure");
    registerDriver("fonts-cancel-test", async () => ({ ok: false, error: { code: "cancelled", message: "cancelled" } }));
    const cancelled = await dispatchExport({ driverId: "fonts-cancel-test", format: "gif", project, options: { fonts }, limits: DEFAULT_LIMITS });
    expect(!cancelled.ok && cancelled.error.code).toBe("cancelled");
    expect(log).toEqual(["add:A", "del:A", "add:A", "del:A"]);
  });

  it("main-thread run returns the font failure and renders no frame when fonts cannot load", async () => {
    vi.stubGlobal("Worker", undefined);
    let ran = false;
    registerDriver("fonts-fail-test", async () => { ran = true; return okResult; });
    // Node has no FontFace -> font-not-ready.
    const r = await dispatchExport({ driverId: "fonts-fail-test", format: "gif", project, options: { fonts: [{ family: "A", weight: 400, data: new ArrayBuffer(4) }] }, limits: DEFAULT_LIMITS });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("font-not-ready");
    expect(ran).toBe(false);
  });
});
