import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { reduce, INITIAL, type ExportEvent, type ExportFormatId, type ExportState } from "./machine.js";
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
  it("running -> cancelled", () => {
    let s = reduce(reduce(INITIAL, { type: "open", capabilities: caps }), { type: "start" });
    s = reduce(s, { type: "cancelled" });
    expect(s.status).toBe("cancelled");
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
const RESULT = { ok: true as const, format: "mp4" as const, file: new Blob(), fileName: "x.mp4", summary: { width: 2, height: 2, fps: 30, frameCount: 1, byteSize: 1, notes: [] } };
/** Drives the machine to each terminal state, from a configuring state with this format. */
function terminal(kind: "done" | "failed" | "cancelled", format: ExportFormatId): ExportState {
  let s = reduce(reduce(INITIAL, { type: "open", capabilities: caps }), { type: "select-format", format });
  s = reduce(s, { type: "start" });
  if (kind === "done") return reduce(s, { type: "success", result: RESULT });
  if (kind === "failed") return reduce(s, { type: "fail", error: { code: "out-of-memory", message: "x" } });
  return reduce(s, { type: "cancelled" });
}
describe("every terminal state can retry (Back, Export again)", () => {
  for (const kind of ["done", "failed", "cancelled"] as const) {
    it(`${kind} -> reset -> configuring, with the capabilities and the chosen format kept`, () => {
      const s = terminal(kind, "gif");
      expect(s.status).toBe(kind);
      const r = reduce(s, { type: "reset" });
      expect(r.status).toBe("configuring");
      expect(r.status === "configuring" && r.capabilities).toBe(caps);
      expect(r.status === "configuring" && r.format).toBe("gif");
    });
    it(`${kind} -> reset -> start -> success runs a second export to completion`, () => {
      let s = reduce(terminal(kind, "mp4"), { type: "reset" });
      s = reduce(s, { type: "start" });
      expect(s.status).toBe("running");
      s = reduce(s, { type: "progress", fraction: 0.5 });
      s = reduce(s, { type: "success", result: RESULT });
      expect(s.status).toBe("done");
    });
    it(`${kind} -> reset -> a different format can be chosen and started`, () => {
      let s = reduce(terminal(kind, "mp4"), { type: "reset" });
      s = reduce(s, { type: "select-format", format: "png-sequence" });
      s = reduce(s, { type: "start" });
      expect(s.status === "running" && s.format).toBe("png-sequence");
    });
  }
  it("reset does nothing in idle, configuring, or running (the same state object comes back)", () => {
    const configuring = reduce(INITIAL, { type: "open", capabilities: caps });
    const running = reduce(configuring, { type: "start" });
    for (const s of [INITIAL, configuring, running]) expect(reduce(s, { type: "reset" })).toBe(s);
  });
  it("a failure or cancel can happen and be retried repeatedly", () => {
    let s = reduce(INITIAL, { type: "open", capabilities: caps });
    for (let i = 0; i < 5; i++) {
      s = reduce(s, { type: "start" });
      s = reduce(s, i % 2 === 0 ? { type: "cancelled" } : { type: "fail", error: { code: "encoder-failure", message: "x" } });
      s = reduce(s, { type: "reset" });
      expect(s.status).toBe("configuring");
    }
  });
  // Feature: studio, Property 16: A finished export can always be retried
  it("Property 16: from any state reached by any event sequence, a terminal state resets to the format step and can start again", () => {
    const arbEvent: fc.Arbitrary<ExportEvent> = fc.oneof(
      fc.constant<ExportEvent>({ type: "start" }),
      fc.constant<ExportEvent>({ type: "cancelled" }),
      fc.constant<ExportEvent>({ type: "reset" }),
      fc.double({ min: 0, max: 1, noNaN: true }).map<ExportEvent>((fraction) => ({ type: "progress", fraction })),
      fc.constant<ExportEvent>({ type: "success", result: RESULT }),
      fc.constant<ExportEvent>({ type: "fail", error: { code: "muxer-failure", message: "x" } }),
      fc.constantFrom<ExportFormatId>("mp4", "png-sequence", "gif").map<ExportEvent>((format) => ({ type: "select-format", format })),
    );
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 40 }), (events) => {
        let s = reduce(INITIAL, { type: "open", capabilities: caps });
        for (const e of events) s = reduce(s, e);
        if (s.status === "done" || s.status === "failed" || s.status === "cancelled") {
          const r = reduce(s, { type: "reset" });
          expect(r.status).toBe("configuring");
          expect(reduce(r, { type: "start" }).status).toBe("running");
        }
      }),
      { numRuns: 200 },
    );
  });
});
