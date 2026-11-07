/**
 * JSON Schema generation for the engine's public Zod schemas (Task 11.1).
 *
 * The Zod definitions in `packages/engine/src` are the single source of truth
 * for the engine's data model. This script derives JSON Schema documents from
 * them using Zod v4's native `z.toJSONSchema` (draft 2020-12) — `zod-to-json-schema`
 * is deliberately NOT used. The generated files are committed under
 * `packages/engine/schema/` and kept in sync by the staleness test (Task 11.2).
 *
 * The generation logic is split into a PURE, exportable function
 * (`generateSchemas`) that returns a map of relative filename → schema object
 * with no disk access, and a `writeSchemas` / `main` pair that persists the
 * result. The staleness test imports `generateSchemas` and runs it in memory,
 * so the pure function MUST NOT touch the filesystem.
 *
 * Built-in effect ids are read from `builtinRegistry` (the single place that
 * assembles the default registry); each effect's `paramSchema` is pulled from
 * its registered `EffectDefinition`. Adding a built-in effect therefore adds a
 * `<effectId>-params.json` entry automatically.
 *
 * This file lives under `scripts/`, not `src/`, so the engine purity ESLint
 * rules do not apply here and disk writes are allowed. It still avoids banned
 * time/random calls.
 *
 * The engine package intentionally does not depend on `@types/node` (see
 * `migrate.test.ts`), so the handful of Node APIs this script needs for its
 * disk-writing path are typed by the local ambient `scripts/node-shims.d.ts`,
 * which declares only the surface actually used; `tsx` provides the real
 * implementations at runtime. The PURE `generateSchemas()` export touches none
 * of these Node APIs.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { z } from "zod";

import { ProjectSchema } from "../src/schemas/project.js";
import { EffectPackSchema } from "../src/schemas/effect-pack.js";
import { builtinRegistry } from "../src/effects/index.js";

/** The kebab-case ids of the effects bundled with the engine. */
const BUILTIN_EFFECT_IDS = ["typewriter", "fade-slide"] as const;

/**
 * Generates every JSON Schema document in memory, keyed by the relative file
 * name it should be written to. Pure: no filesystem, clock, or randomness.
 *
 * @returns A map of `<filename>.json` → JSON Schema object.
 */
export function generateSchemas(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {
    "project.json": z.toJSONSchema(ProjectSchema),
    "effect-pack.json": z.toJSONSchema(EffectPackSchema),
  };

  for (const id of BUILTIN_EFFECT_IDS) {
    const effect = builtinRegistry.get(id);
    if (effect === undefined) {
      throw new Error(`Built-in effect "${id}" is not registered.`);
    }
    schemas[`${id}-params.json`] = z.toJSONSchema(effect.paramSchema);
  }

  return schemas;
}

/** Absolute path to `packages/engine/schema`, resolved from this module. */
function schemaDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "schema");
}

/**
 * Writes every generated schema to `packages/engine/schema/`, pretty-printed
 * with 2-space indentation and a trailing newline for stable diffs.
 */
export function writeSchemas(): void {
  const dir = schemaDir();
  mkdirSync(dir, { recursive: true });

  const schemas = generateSchemas();
  for (const [fileName, schema] of Object.entries(schemas)) {
    const json = `${JSON.stringify(schema, null, 2)}\n`;
    writeFileSync(join(dir, fileName), json, "utf8");
  }
}

/** Script entry point: write all schemas to disk. */
function main(): void {
  writeSchemas();
}

// Run only when invoked directly as a script, not when imported as a module.
// The staleness test imports `generateSchemas` and never reaches this guard.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
