import { describe, it, expect } from "vitest";
import type { Project } from "@studio/engine";

import { exportWebmAlpha, exportWebp } from "../api.js";
import { detectCapabilities } from "../capabilities.js";

/** A minimal valid project (never actually encoded by the stubs). */
function project(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 64, height: 64, fps: 10, durationSeconds: 0.5 },
    background: "#101018",
    seed: 1,
    layers: [
      {
        id: "a", text: "x", tracks: [], effectInstances: [],
        fontFamily: "sans-serif", fontSize: 20, fontWeight: "bold", fill: "#ffffff",
        align: "left", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 0.5, anchor: { x: 32, y: 40 },
      },
    ],
  } as Project;
}

describe("deferred format stubs", () => {
  it("exportWebmAlpha returns a typed browser-unsupported failure", async () => {
    const r = await exportWebmAlpha(project());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("browser-unsupported");
      expect(r.error.message).toMatch(/not available in this release/i);
    }
  });

  it("exportWebp returns a typed browser-unsupported failure", async () => {
    const r = await exportWebp(project());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("browser-unsupported");
      expect(r.error.message).toMatch(/not available in this release/i);
    }
  });
});

describe("capability report for deferred formats", () => {
  it("reports webmAlpha and webp unsupported even if the runtime would support them", async () => {
    // Inject an env where every probe would report supported; the report must
    // STILL mark the deferred formats unsupported.
    const report = await detectCapabilities({
      VideoEncoder: { isConfigSupported: async () => ({ supported: true, config: {} }) } as never,
      AudioEncoder: { isConfigSupported: async () => ({ supported: true, config: {} }) } as never,
      probeWebp: async () => "image/webp",
    });
    expect(report.webmAlpha.status).toBe("unsupported");
    expect(report.webp.status).toBe("unsupported");
    expect(report.webmAlpha.reason).toMatch(/not available in this release/i);
    expect(report.webp.reason).toMatch(/not available in this release/i);
    // Shipped formats remain available.
    expect(report.gif.status).toBe("supported");
    expect(report.pngSequence.status).toBe("supported");
    expect(report.mp4.status).toBe("supported");
  });
});
