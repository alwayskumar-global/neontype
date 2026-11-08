import { describe, it, expect } from "vitest";
import { ProjectSchema } from "@studio/engine";
import { demoProject } from "./demo.js";

describe("demoProject", () => {
  it("is schema-valid, 1280x720, ~6s, <=3 layers with one Tamil layer, no blur", () => {
    const p = demoProject();
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    expect(p.canvas).toMatchObject({ width: 1280, height: 720, fps: 30 });
    expect(p.canvas.durationSeconds).toBeLessThanOrEqual(6);
    expect(p.layers.length).toBeLessThanOrEqual(3);
    expect(p.layers.some((l) => l.fontFamily === "Noto Sans Tamil")).toBe(true);
    const blurLayers = p.layers.filter((l) => l.effectInstances.some((e) => e.effectId === "blur-in"));
    // The blur layer was dropped after perf measurement so 1280x720 holds 30fps.
    expect(blurLayers.length).toBe(0);
  });
});
