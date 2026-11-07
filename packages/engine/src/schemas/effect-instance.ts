/**
 * Zod schema for an EffectInstance — a reference from a TextLayer to an effect
 * by its kebab-case id, plus a granularity setting and effect-specific params.
 *
 * This schema is the source of truth for the EffectInstance data model (R1.6).
 *
 * `effectId` kebab-case rule: effect ids are kebab-case strings matching their
 * effect directory name (per steering). The regex below enforces that shape:
 *
 *   /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
 *
 * - must start with a lowercase letter,
 * - followed by lowercase letters / digits,
 * - with optional `-`-joined segments of lowercase letters / digits.
 *
 * This rejects empty strings (satisfying the non-empty constraint), uppercase
 * letters, underscores, and leading / trailing / doubled hyphens.
 *
 * `params` typing: this generic schema accepts an object with arbitrary
 * unknown-typed values. The exact per-effect parameter validation happens at
 * runtime against the referenced effect's own parameter schema (R1.6), not
 * here. Under the installed Zod v4, `z.record` requires an explicit key schema,
 * so this uses `z.record(z.string(), z.unknown())`.
 */

import { z } from "zod";

/**
 * Kebab-case effect id: lowercase letters / digits in `-`-joined segments,
 * starting with a letter. Also rejects the empty string.
 */
const kebabCaseEffectId = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The three granularity settings an effect instance can target. */
const GranularitySchema = z.enum(["character", "word", "line"]);

/**
 * An effect instance: a kebab-case `effectId`, a `granularity`, and a `params`
 * record of arbitrary unknown-typed values (validated per-effect at runtime).
 */
export const EffectInstanceSchema = z.object({
  effectId: z.string().regex(kebabCaseEffectId),
  granularity: GranularitySchema,
  params: z.record(z.string(), z.unknown()),
});

/** The effect-instance type, derived from `EffectInstanceSchema`. */
export type EffectInstance = z.infer<typeof EffectInstanceSchema>;
