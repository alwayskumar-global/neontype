/**
 * Zod schema for an EffectPack — a versioned, self-contained JSON preset that
 * declares one or more effect instances together with the parameter descriptors
 * a UI uses to surface and edit their params (R3.1).
 *
 * This schema is the source of truth for the EffectPack data model. It is a
 * pure Zod definition: it never invokes `eval` or `Function`, satisfying the
 * "contains no executable code" security requirement (R3.8). EffectPacks are
 * untrusted input, so validation never throws — `safeParse` reports every
 * violated constraint as a `ZodError` (R3.2).
 *
 * Field shape (R3.1):
 * - `schemaVersion`: positive integer.
 * - `id`: non-empty kebab-case string (same shape as effect ids in
 *   `effect-instance.ts`).
 * - `displayName`: non-empty string.
 * - `description`: string (may be empty).
 * - `effectInstances`: array of `EffectInstanceSchema`, max 16 (reuses the
 *   existing instance schema for effectId/granularity/params validation).
 * - `paramDescriptors`: array of descriptor objects, modelled as a discriminated
 *   union on `type` so each variant (`number` | `enum` | `color`) carries its
 *   own type-specific fields alongside the shared `key` and `binding`.
 *
 * Cross-field invariant (R3.10): a `.superRefine()` validates that every
 * descriptor's `binding.effectInstanceIndex` is a valid 0-based index into the
 * `effectInstances` array (`0 <= index < effectInstances.length`). Whether the
 * referenced `paramKey` exists in that effect's real paramSchema is a RUNTIME
 * check done later against the registry — it is deliberately NOT done here.
 *
 * Note (R3.9 deferral): R3.9 requires a 1 MB size pre-check before parsing an
 * EffectPack. That belongs to a parse function (analogous to `parseProject`'s
 * size check), not to the schema object itself. Task 3.4 only asks for the
 * schema and the binding-bounds superRefine, so no size check is implemented
 * here; the parse wiring is a separate concern handled where EffectPack parsing
 * is introduced.
 */

import { z } from "zod";

import { EffectInstanceSchema } from "./effect-instance.js";
import { HexColorSchema } from "./project.js";

/**
 * Kebab-case pack id: lowercase letters / digits in `-`-joined segments,
 * starting with a letter. Also rejects the empty string. Mirrors the
 * effect-id regex style used in `effect-instance.ts`.
 */
const kebabCasePackId = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * The binding that ties a param descriptor to a specific effect instance's
 * parameter: a 0-based index into `effectInstances` plus the target `paramKey`.
 * The index-in-bounds check lives in the top-level `.superRefine()` because it
 * needs access to the sibling `effectInstances` array.
 */
const BindingSchema = z.object({
  effectInstanceIndex: z.number().int().nonnegative(),
  paramKey: z.string(),
});

/** A `number` param descriptor: numeric range plus a numeric default. */
const NumberDescriptorSchema = z.object({
  key: z.string(),
  type: z.literal("number"),
  binding: BindingSchema,
  min: z.number(),
  max: z.number(),
  default: z.number(),
});

/** An `enum` param descriptor: the allowed string values plus a string default. */
const EnumDescriptorSchema = z.object({
  key: z.string(),
  type: z.literal("enum"),
  binding: BindingSchema,
  values: z.array(z.string()),
  default: z.string(),
});

/** A `color` param descriptor: a hex-color default (reuses `HexColorSchema`). */
const ColorDescriptorSchema = z.object({
  key: z.string(),
  type: z.literal("color"),
  binding: BindingSchema,
  default: HexColorSchema,
});

/**
 * A param descriptor discriminated on `type`, so each variant carries exactly
 * its own type-specific fields alongside the shared `key` and `binding`.
 */
const ParamDescriptorSchema = z.discriminatedUnion("type", [
  NumberDescriptorSchema,
  EnumDescriptorSchema,
  ColorDescriptorSchema,
]);

/**
 * The EffectPack document (R3.1). The `.superRefine()` enforces the cross-field
 * binding-bounds invariant (R3.10): every descriptor's
 * `binding.effectInstanceIndex` must index into `effectInstances`.
 */
export const EffectPackSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    id: z.string().regex(kebabCasePackId),
    displayName: z.string().min(1),
    description: z.string(),
    effectInstances: z.array(EffectInstanceSchema).max(16),
    paramDescriptors: z.array(ParamDescriptorSchema),
  })
  .superRefine((pack, ctx) => {
    const instanceCount = pack.effectInstances.length;
    for (let di = 0; di < pack.paramDescriptors.length; di++) {
      const index = pack.paramDescriptors[di].binding.effectInstanceIndex;
      if (index >= instanceCount) {
        ctx.addIssue({
          code: "custom",
          message:
            "binding.effectInstanceIndex must be within bounds of effectInstances.",
          path: ["paramDescriptors", di, "binding", "effectInstanceIndex"],
        });
      }
    }
  });

/** The effect-pack type, derived from `EffectPackSchema`. */
export type EffectPack = z.infer<typeof EffectPackSchema>;
