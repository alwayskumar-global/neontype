/**
 * New-project factory and a few Project helpers (pure, DOM-free).
 *
 * The default new project matches the resolved Open Question 1: 1280x720, 30 fps,
 * 5 s, opaque #101018, one starter text layer carrying the `fade-slide` effect.
 * All values satisfy the engine `ProjectSchema`.
 */

import {
  presetCatalog,
  type Project,
  type TextLayer,
  type EffectInstance,
  CURRENT_PROJECT_VERSION,
} from "@studio/engine";

/** The two bundled font families offered in the UI. */
export const FONT_FAMILIES = ["Noto Sans", "Noto Sans Tamil"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Looks up a catalog entry's default params + first supported granularity. */
export function defaultEffectInstance(effectId: string): EffectInstance {
  const entry = presetCatalog.find((e) => e.id === effectId);
  if (!entry) {
    throw new Error(`Unknown effect id: ${effectId}`);
  }
  return {
    effectId: entry.id,
    granularity: entry.supportedGranularities[0],
    params: { ...entry.defaultParams },
  };
}

/** Builds a schema-valid starter text layer. */
export function makeDefaultLayer(id: string, durationSeconds: number): TextLayer {
  return {
    id,
    text: "Your Title",
    tracks: [],
    effectInstances: [defaultEffectInstance("fade-slide")],
    fontFamily: "Noto Sans",
    fontSize: 96,
    fontWeight: "700",
    fill: "#ffffff",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.2,
    maxWidth: null,
    startSeconds: 0,
    endSeconds: durationSeconds,
    anchor: { x: 640, y: 360 },
  };
}

/** The default new project (Open Question 1). */
export function newProject(): Project {
  const durationSeconds = 5;
  return {
    schemaVersion: CURRENT_PROJECT_VERSION,
    canvas: { width: 1280, height: 720, fps: 30, durationSeconds },
    background: "#101018",
    seed: 1,
    layers: [makeDefaultLayer("layer-1", durationSeconds)],
  };
}

/** A stable new layer id given the existing layers (deterministic; no clock). */
export function nextLayerId(project: Project): string {
  let n = project.layers.length + 1;
  const ids = new Set(project.layers.map((l) => l.id));
  while (ids.has(`layer-${n}`)) n += 1;
  return `layer-${n}`;
}
