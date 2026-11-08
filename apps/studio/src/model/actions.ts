/**
 * The discriminated-union of model actions (pure data). Every studio state
 * change is one of these; `applyAction` in transitions.ts interprets them.
 */

import type { Granularity } from "@studio/engine";
import type { FontFamily } from "./project.js";

/** Canvas/background settings edits. */
export type SettingsAction =
  | { type: "set-canvas-size"; width: number; height: number }
  | { type: "set-fps"; fps: number }
  | { type: "set-duration"; durationSeconds: number }
  | { type: "set-background"; background: string }
  | { type: "set-transparent"; transparent: boolean };

/** Layer actions. */
export type LayerAction =
  | { type: "add-layer" }
  | { type: "delete-layer"; id: string }
  | { type: "reorder-layer"; id: string; toIndex: number }
  | { type: "set-text"; id: string; text: string }
  | { type: "set-font-family"; id: string; fontFamily: FontFamily }
  | { type: "set-font-size"; id: string; fontSize: number }
  | { type: "set-font-weight"; id: string; fontWeight: string }
  | { type: "set-fill"; id: string; fill: string }
  | { type: "set-align"; id: string; align: "left" | "center" | "right" }
  | { type: "set-anchor"; id: string; x: number; y: number }
  | { type: "set-layer-timing"; id: string; startSeconds: number; endSeconds: number };

/** Effect actions. */
export type EffectAction =
  | { type: "add-effect"; layerId: string; effectId: string }
  | { type: "set-effect-granularity"; layerId: string; index: number; granularity: Granularity }
  | { type: "set-effect-param"; layerId: string; index: number; key: string; value: unknown }
  | { type: "remove-effect"; layerId: string; index: number };

/** All model actions. */
export type Action = SettingsAction | LayerAction | EffectAction;
