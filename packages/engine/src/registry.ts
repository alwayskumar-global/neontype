/**
 * Effect registry and the types that describe an effect definition.
 *
 * An effect is a pure function from a per-segment context (`ApplyEffectArgs`)
 * to a set of visual overrides (`SegmentOverrides`). Effects are registered by
 * their kebab-case id into a registry so renderers can resolve them by id.
 *
 * `createRegistry` is a factory, not a singleton: each call returns a fresh,
 * independent registry backed by its own `Map`. There is no shared or global
 * registration state (R7 design).
 */

import { z } from "zod";

import { DuplicateEffectError } from "./errors.js";
import type { PRNG } from "./prng.js";

/**
 * The visual overrides an effect contributes for a single segment at a given
 * time. All fields are optional; omitted fields leave the underlying layer
 * value unchanged. The renderer composes these overrides onto layout/layer
 * state when drawing the segment.
 */
export interface SegmentOverrides {
  /** Additive offset in px relative to the segment's layoutX/layoutY. */
  positionOffset?: [number, number];
  /** Multiplicative scale factor. */
  scale?: number;
  /** Rotation in degrees. */
  rotation?: number;
  /** Opacity in [0, 1]; multiplied with layer opacity and clamped. */
  opacity?: number;
  /** Blur radius in px. */
  blur?: number;
  /** `#rrggbb` hex color string. */
  color?: string;
}

/**
 * The per-segment context passed to an effect's `applyEffect`. Indices identify
 * the segment within its layer across every granularity; `groupIndex` and
 * `groupCount` are relative to the effect's own granularity grouping.
 */
export interface ApplyEffectArgs {
  /**
   * Text of the group the effect targets: the full grapheme-cluster string for
   * character granularity, the word string for word granularity, or the line
   * string for line granularity.
   */
  groupText: string;
  charIndex: number;
  wordIndex: number;
  lineIndex: number;
  groupIndex: number;
  groupCount: number;
  /** Layer-local time in seconds. */
  t: number;
  params: Record<string, unknown>;
  prng: PRNG;
}

/**
 * A registered effect: its kebab-case id, a human-readable display name, a Zod
 * schema for its params, and the pure `applyEffect` function that maps a
 * per-segment context to visual overrides.
 */
export interface EffectDefinition {
  /** kebab-case effect id, matching the effect's directory name. */
  id: string;
  displayName: string;
  /** Zod schema validating this effect's `params`. */
  paramSchema: z.ZodType;
  applyEffect(args: ApplyEffectArgs): SegmentOverrides;
}

/** A registry of effect definitions keyed by their kebab-case id. */
export interface EffectRegistry {
  /**
   * Registers an effect definition. Throws `DuplicateEffectError` if an effect
   * with the same id is already registered.
   */
  register(definition: EffectDefinition): void;
  /** Returns the effect with the given id, or `undefined` if none is registered. */
  get(id: string): EffectDefinition | undefined;
}

/**
 * Creates a fresh, independent effect registry backed by a `Map`. Registries
 * do not share state; registering in one never affects another.
 */
export function createRegistry(): EffectRegistry {
  const effects = new Map<string, EffectDefinition>();
  return {
    register(definition: EffectDefinition): void {
      if (effects.has(definition.id)) {
        throw new DuplicateEffectError(
          `Effect "${definition.id}" is already registered.`,
          definition.id,
        );
      }
      effects.set(definition.id, definition);
    },
    get(id: string): EffectDefinition | undefined {
      return effects.get(id);
    },
  };
}
