/**
 * Studio-side tables the engine catalog does not carry (design gaps D-5 and D-6, Requirement 19.10).
 * They live here, not in `packages/`, and `tables.test.ts` keeps them in step with `presetCatalog`.
 */
import type { PresetCatalogEntry } from "@studio/engine";
/** The four groups the Effects Library screen filters by. */
export const CATEGORIES = ["Entrance", "Emphasis", "Exit", "Looping"] as const;
export type Category = (typeof CATEGORIES)[number];
/** Category of every catalog effect, keyed by effect id. */
export const CATEGORY_BY_ID: Readonly<Record<string, Category>> = {
  typewriter: "Entrance",
  "fade-slide": "Entrance",
  "blur-in": "Entrance",
  "glitch-reveal": "Entrance",
  "rotate-drop": "Entrance",
  "line-wipe": "Entrance",
  "kinetic-pop": "Emphasis",
  "scale-bounce": "Emphasis",
  spotlight: "Emphasis",
  "letter-spread": "Exit",
  "neon-flicker": "Looping",
  wave: "Looping",
};
/** The slider range for one numeric param. */
export interface ParamRange {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}
const s = (label: string, min: number, max: number, step: number, unit: string): ParamRange => ({ label, min, max, step, unit });
/**
 * Numeric param ranges, keyed by effect id then param key. Only numeric params appear; enum and
 * boolean params are not sliders. Every range lies inside what the effect's param schema accepts.
 */
export const RANGES_BY_ID: Readonly<Record<string, Readonly<Record<string, ParamRange>>>> = {
  typewriter: { startDelay: s("Start delay", 0, 5, 0.05, "s"), delayPerCharacter: s("Per character", 0, 1, 0.01, "s") },
  "fade-slide": { durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), slideDistance: s("Distance", 0, 200, 1, "px"), delayPerSegment: s("Stagger", 0, 1, 0.01, "s") },
  "blur-in": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), startBlur: s("Blur", 0, 32, 1, "px"), delayPerGroup: s("Stagger", 0, 1, 0.01, "s") },
  "glitch-reveal": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), delayPerGroup: s("Stagger", 0, 1, 0.01, "s"), maxOffset: s("Intensity", 0, 60, 1, "px"), steps: s("Steps", 1, 24, 1, "") },
  "kinetic-pop": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), delayPerGroup: s("Stagger", 0, 1, 0.01, "s"), startScale: s("Start scale", 0, 1, 0.05, ""), overshoot: s("Overshoot", 0, 1, 0.05, "") },
  "letter-spread": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), spreadDistance: s("Spread", 0, 200, 1, "px") },
  "line-wipe": { startDelay: s("Start delay", 0, 5, 0.05, "s"), delayPerGroup: s("Line delay", 0, 1, 0.01, "s"), fadeSeconds: s("Edge softness", 0, 1, 0.01, "s") },
  "neon-flicker": { periodSeconds: s("Period", 0.1, 5, 0.05, "s"), minOpacity: s("Min opacity", 0, 1, 0.05, ""), cellsPerPeriod: s("Cells", 1, 64, 1, ""), phasePerGroup: s("Phase", 0, 1, 0.01, "") },
  "rotate-drop": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), delayPerGroup: s("Stagger", 0, 1, 0.01, "s"), dropDistance: s("Drop", -400, 400, 1, "px"), startRotation: s("Angle", -180, 180, 1, "°") },
  "scale-bounce": { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), delayPerGroup: s("Stagger", 0, 1, 0.01, "s"), startScale: s("Start scale", 0, 1, 0.05, ""), bounces: s("Bounces", 0, 8, 1, "") },
  spotlight: { startDelay: s("Start delay", 0, 5, 0.05, "s"), durationSeconds: s("Duration", 0.05, 5, 0.05, "s"), radius: s("Radius", 0.1, 3, 0.05, ""), dimOpacity: s("Dim", 0, 1, 0.05, "") },
  wave: { periodSeconds: s("Period", 0.1, 5, 0.05, "s"), amplitude: s("Amplitude", 0, 100, 1, "px"), phasePerGroup: s("Phase", 0, 2, 0.05, "") },
};
/** Labels of the enum params (the choice params), by param key. A drift test checks every enum param has one. */
export const ENUM_LABELS: Readonly<Record<string, string>> = { direction: "Direction", axis: "Axis", slideAxis: "Slide axis", easing: "Easing" };
/** The library's category for a catalog entry. */
export function categoryOf(entry: Pick<PresetCatalogEntry, "id">): Category {
  return CATEGORY_BY_ID[entry.id] ?? "Entrance";
}
