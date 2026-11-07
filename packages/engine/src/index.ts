export {
  ParseError,
  MigrationError,
  DuplicateEffectError,
  InvalidEffectParamsError,
} from "./errors.js";

export { createPRNG } from "./prng.js";
export type { PRNG } from "./prng.js";

export { EasingSchema, KeyframeSchema, KeyframeTrackSchema } from "./schemas/keyframe.js";
export type { Easing } from "./schemas/keyframe.js";

export { EffectInstanceSchema } from "./schemas/effect-instance.js";
export type { EffectInstance } from "./schemas/effect-instance.js";

export {
  HexColorSchema,
  BackgroundSchema,
  TextLayerSchema,
  ProjectSchema,
} from "./schemas/project.js";
export type { Project, TextLayer } from "./schemas/project.js";

export { EffectPackSchema } from "./schemas/effect-pack.js";
export type { EffectPack } from "./schemas/effect-pack.js";

export { CURRENT_PROJECT_VERSION } from "./schemas/constants.js";

export { serializeProject, parseProject } from "./serialize.js";

export { migrateProject } from "./migrate.js";
export type { MigrationFn, MigrationMap } from "./migrate.js";

export { FakeMetricsProvider, CanvasMetricsProvider } from "./metrics.js";
export type { FontSpec, TextMetricsProvider } from "./metrics.js";

export { createRegistry } from "./registry.js";
export type {
  EffectDefinition,
  EffectRegistry,
  SegmentOverrides,
  ApplyEffectArgs,
} from "./registry.js";

export { registerBuiltinEffects, builtinRegistry } from "./effects/index.js";

export { computeFrameState } from "./compute.js";
export type {
  ComputeOpts,
  FrameState,
  LayerState,
  BaseSegment,
  EngineWarning,
  UnknownEffectWarning,
  InvalidEffectParamsWarning,
} from "./compute.js";
