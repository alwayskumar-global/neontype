import { describe, it, expect } from "vitest";
import type { Project } from "@studio/engine";

import { planMp4Output, isMp4Plan } from "./mp4.js";

/** A minimal valid project at an arbitrary canvas size/background. */
function project(overrides: {
  width?: number;
  height?: number;
  background?: string;
}): Project {
  return {
    schemaVersion: 1,
    canvas: {
      width: overrides.width ?? 640,
      height: overrides.height ?? 360,
      fps: 30,
      durationSeconds: 1,
    },
    background: overrides.background ?? "#101018",
    seed: 1,
    layers: [
      {
        id: "a",
        text: "Hi",
        tracks: [],
        effectInstances: [],
        fontFamily: "sans-serif",
        fontSize: 32,
        fontWeight: "bold",
        fill: "#ffffff",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: null,
        startSeconds: 0,
        endSeconds: 1,
        anchor: { x: 0, y: 0 },
      },
    ],
  } as Project;
}

describe("planMp4Output", () => {
  it("rejects a project that fails the engine schema with project-invalid", () => {
    const bad = { schemaVersion: 1, canvas: {}, layers: [] } as unknown as Project;
    const r = planMp4Output(bad, {});
    expect(isMp4Plan(r)).toBe(false);
    if (!isMp4Plan(r) && r.ok === false) expect(r.error.code).toBe("project-invalid");
  });

  it("rejects an invalid backgroundFallback with invalid-options", () => {
    const r = planMp4Output(project({}), { backgroundFallback: "red" });
    expect(isMp4Plan(r)).toBe(false);
    if (!isMp4Plan(r) && r.ok === false) {
      expect(r.error.code).toBe("invalid-options");
      expect(r.error.fieldPaths).toContain("backgroundFallback");
    }
  });

  it("attaches the mp4-no-transparency note for a transparent project", () => {
    const r = planMp4Output(project({ background: "transparent" }), {});
    expect(isMp4Plan(r)).toBe(true);
    if (isMp4Plan(r)) expect(r.notes).toContain("mp4-no-transparency");
  });

  it("omits the note for an opaque project", () => {
    const r = planMp4Output(project({ background: "#123456" }), {});
    expect(isMp4Plan(r)).toBe(true);
    if (isMp4Plan(r)) expect(r.notes).not.toContain("mp4-no-transparency");
  });

  it("rounds odd output dimensions up to even for H.264 and reports them", () => {
    // Odd canvas dimensions -> plan rounds both up to the next even integer.
    const r = planMp4Output(project({ width: 641, height: 361 }), {});
    expect(isMp4Plan(r)).toBe(true);
    if (isMp4Plan(r)) {
      expect(r.width % 2).toBe(0);
      expect(r.height % 2).toBe(0);
      expect(r.width).toBe(642);
      expect(r.height).toBe(362);
    }
  });

  it("leaves already-even dimensions unchanged", () => {
    const r = planMp4Output(project({ width: 640, height: 360 }), {});
    expect(isMp4Plan(r)).toBe(true);
    if (isMp4Plan(r)) {
      expect(r.width).toBe(640);
      expect(r.height).toBe(360);
      expect(r.scalePlan.needsScaling).toBe(false);
    }
  });
});
