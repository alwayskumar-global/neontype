/**
 * Built-in demo project (showcase for the demo video). 1280x720, 30 fps, ~6 s,
 * three layers: a kinetic-pop title, a Tamil typewriter line (Noto Sans Tamil),
 * and a word-granularity fade-slide subtitle. All cheap effects so 1280x720
 * playback holds 30 fps (the blur layer was dropped after measurement).
 * Schema-valid Project value only (no UI state).
 */
import type { Project } from "@studio/engine";

export function demoProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 1280, height: 720, fps: 30, durationSeconds: 6 },
    background: "#101018",
    seed: 1337,
    layers: [
      {
        id: "title",
        text: "Motion Text",
        tracks: [],
        effectInstances: [
          { effectId: "kinetic-pop", granularity: "character", params: { startDelay: 0.1, durationSeconds: 0.5, delayPerGroup: 0.04, startScale: 0.2, overshoot: 0.3 } },
        ],
        fontFamily: "Noto Sans", fontSize: 120, fontWeight: "700", fill: "#ffcc00",
        align: "center", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0, endSeconds: 6, anchor: { x: 640, y: 300 },
      },
      {
        id: "tamil",
        text: "வணக்கம்",
        tracks: [],
        effectInstances: [
          { effectId: "typewriter", granularity: "character", params: { startDelay: 0.8, delayPerCharacter: 0.08, direction: "forward" } },
        ],
        fontFamily: "Noto Sans Tamil", fontSize: 72, fontWeight: "700", fill: "#2dd3f0",
        align: "center", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 0.6, endSeconds: 6, anchor: { x: 640, y: 430 },
      },
      {
        id: "subtitle",
        text: "built in the browser",
        tracks: [],
        effectInstances: [
          { effectId: "fade-slide", granularity: "word", params: { durationSeconds: 0.5, slideDistance: 24, slideAxis: "y", delayPerSegment: 0.1, easing: "easeOut" } },
        ],
        fontFamily: "Noto Sans", fontSize: 40, fontWeight: "400", fill: "#e4e8ee",
        align: "center", letterSpacing: 0, lineHeight: 1.2, maxWidth: null,
        startSeconds: 1.4, endSeconds: 6, anchor: { x: 640, y: 520 },
      },
    ],
  };
}
