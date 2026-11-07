/**
 * The machine-readable preset catalog (Requirement 14).
 *
 * `presetCatalog` enumerates every built-in effect with the metadata the studio
 * UI needs to list and configure effects without hardcoding ids, names, or
 * default params. It is PLAIN DATA and MUST NOT throw at module load — the
 * catalog/registry consistency (ids registered, display names match, default
 * params valid, etc.) is enforced solely by the drift-guard test
 * (`catalog.test.ts`, Requirement 15), not at import time.
 *
 * Each entry's `displayName` must match the corresponding
 * `EffectDefinition.displayName`, each `defaultParams` must pass that effect's
 * `paramSchema`, and `loop` is `true` only for the two looping effects (`wave`,
 * `neon-flicker`).
 */

/** The granularities an effect can be applied at. */
export type Granularity = "character" | "word" | "line";

/** One catalog record describing a built-in effect for UI consumption. */
export interface PresetCatalogEntry {
  /** kebab-case id, matching a registered effect id and its directory name. */
  id: string;
  /** Human-readable name, matching the registered `EffectDefinition.displayName`. */
  displayName: string;
  /** One-line description (no newline). */
  description: string;
  /** Non-empty, distinct subset of the three granularities. */
  supportedGranularities: Granularity[];
  /** Default params; passes the effect's `paramSchema`. */
  defaultParams: Record<string, unknown>;
  /** `true` only for looping effects (`wave`, `neon-flicker`). */
  loop: boolean;
}

const ALL: Granularity[] = ["character", "word", "line"];

/** The preset catalog: all twelve built-in effects. */
export const presetCatalog: readonly PresetCatalogEntry[] = [
  {
    id: "typewriter",
    displayName: "Typewriter",
    description: "Reveals groups one at a time, in order.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, delayPerCharacter: 0.05, direction: "forward" },
    loop: false,
  },
  {
    id: "fade-slide",
    displayName: "Fade Slide",
    description: "Fades and slides each group into place along one axis.",
    supportedGranularities: [...ALL],
    defaultParams: { durationSeconds: 0.5, slideDistance: 24, slideAxis: "y", delayPerSegment: 0.05, easing: "easeOut" },
    loop: false,
  },
  {
    id: "blur-in",
    displayName: "Blur In",
    description: "Resolves each group from a blurred, transparent start into focus.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.6, startBlur: 12, delayPerGroup: 0.05, easing: "easeOut" },
    loop: false,
  },
  {
    id: "glitch-reveal",
    displayName: "Glitch Reveal",
    description: "Reveals each group with a brief jittered, digital-glitch distortion.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.5, delayPerGroup: 0.04, maxOffset: 18, steps: 8, easing: "easeOut" },
    loop: false,
  },
  {
    id: "kinetic-pop",
    displayName: "Kinetic Pop",
    description: "Pops each group in with a scale overshoot before settling.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.45, delayPerGroup: 0.05, startScale: 0.2, overshoot: 0.25, easing: "easeOut" },
    loop: false,
  },
  {
    id: "letter-spread",
    displayName: "Letter Spread",
    description: "Opens each group outward from a collapsed position into its layout.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.5, spreadDistance: 24, axis: "x", easing: "easeOut" },
    loop: false,
  },
  {
    id: "line-wipe",
    displayName: "Line Wipe",
    description: "Sweeps a reveal across the groups in order.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, delayPerGroup: 0.05, fadeSeconds: 0.12, direction: "forward", easing: "easeOut" },
    loop: false,
  },
  {
    id: "neon-flicker",
    displayName: "Neon Flicker",
    description: "Flickers each group's brightness like a neon sign.",
    supportedGranularities: [...ALL],
    defaultParams: { periodSeconds: 1.2, minOpacity: 0.4, cellsPerPeriod: 16, phasePerGroup: 0.07 },
    loop: true,
  },
  {
    id: "rotate-drop",
    displayName: "Rotate Drop",
    description: "Drops each group into place while rotating to upright.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.5, delayPerGroup: 0.05, dropDistance: -120, startRotation: -90, easing: "easeOut" },
    loop: false,
  },
  {
    id: "scale-bounce",
    displayName: "Scale Bounce",
    description: "Bounces each group in with a damped scale overshoot.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 0.6, delayPerGroup: 0.05, startScale: 0, bounces: 2 },
    loop: false,
  },
  {
    id: "spotlight",
    displayName: "Spotlight",
    description: "Moves a brightened focus across the groups, dimming the rest.",
    supportedGranularities: [...ALL],
    defaultParams: { startDelay: 0, durationSeconds: 1.5, radius: 1, dimOpacity: 0.15, settleAtEnd: true },
    loop: false,
  },
  {
    id: "wave",
    displayName: "Wave",
    description: "Oscillates each group along an axis with a traveling phase.",
    supportedGranularities: [...ALL],
    defaultParams: { periodSeconds: 1.5, amplitude: 16, axis: "y", phasePerGroup: 0.6 },
    loop: true,
  },
];
