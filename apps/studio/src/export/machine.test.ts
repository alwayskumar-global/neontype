import { describe, it, expect } from "vitest";
import { reduce, INITIAL } from "./machine.js";
import type { CapabilityReport } from "@studio/exporters";

const caps = {
  mp4: { status: "supported" }, webmAlpha: { status: "unsupported" }, gif: { status: "supported" },
  webp: { status: "unsupported" }, aac: { status: "supported" }, pngSequence: { status: "supported" },
  embed: { status: "supported" },
} as CapabilityReport;

describe("export machine", () => {
  it("idle -> configuring on open", () => {
    const s = reduce(INITIAL, { type: "open", capabilities: caps });
    expect(s.status).toBe("configuring");
  });
  it("configuring -> running on start, progress updates, success -> done", () => {
    let s = reduce(INITIAL, { type: "open", capabilities: caps });
    s = reduce(s, { type: "start" });
    expect(s.status).toBe("running");
    s = reduce(s, { type: "progress", fraction: 0.5 });
    expect(s.status === "running" && s.fraction).toBe(0.5);
    s = reduce(s, { type: "success", result: { ok: true, format: "mp4", file: new Blob(), fileName: "x.mp4", summary: { width: 2, height: 2, fps: 30, frameCount: 1, byteSize: 1, notes: [] } } });
    expect(s.status).toBe("done");
  });
  it("running -> cancelled, and reset -> idle", () => {
    let s = reduce(reduce(INITIAL, { type: "open", capabilities: caps }), { type: "start" });
    s = reduce(s, { type: "cancelled" });
    expect(s.status).toBe("cancelled");
    expect(reduce(s, { type: "reset" }).status).toBe("idle");
  });
  it("running -> failed on fail", () => {
    let s = reduce(reduce(INITIAL, { type: "open", capabilities: caps }), { type: "start" });
    s = reduce(s, { type: "fail", error: { code: "encoder-failure", message: "x" } });
    expect(s.status).toBe("failed");
  });
  it("ignores out-of-state events", () => {
    expect(reduce(INITIAL, { type: "start" }).status).toBe("idle");
  });
});
