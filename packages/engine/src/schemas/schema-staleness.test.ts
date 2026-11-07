/**
 * JSON Schema staleness + AJV validation tests (Task 11.2).
 *
 * Two guarantees are enforced here:
 *
 * 1. **Staleness.** The committed JSON Schema files under
 *    `packages/engine/schema/` must match what `generateSchemas()` produces from
 *    the live Zod definitions. The test runs the generation logic in memory,
 *    reads each committed file, and structurally deep-compares (parsing the
 *    committed JSON first, so formatting is NOT under test). If any file drifts,
 *    the test names it and tells the developer to re-run `generate-schemas`.
 *
 * 2. **AJV validity.** Each generated schema is a real, compilable JSON Schema
 *    that accepts genuine documents. We compile every schema with AJV and
 *    validate a corpus of at least five valid documents sampled from the
 *    fast-check arbitraries (projects, effect packs, and per-effect params).
 *
 * Zod v4's `z.toJSONSchema` targets JSON Schema draft 2020-12, so AJV is
 * constructed from its `ajv/dist/2020` entry point (the matching draft
 * constructor) rather than the default Ajv export.
 *
 * The committed schema files are imported directly as JSON modules (enabled by
 * the engine tsconfig's `resolveJsonModule`), matching the fixture-read pattern
 * in `migrate.test.ts`. This avoids any Node built-in (`fs`/`path`/`url`) and
 * the `@types/node` dependency, keeping the engine dependency-free.
 *
 * This file lives under `src/`, so it uses no banned time/random calls and no
 * `eslint-disable` directives.
 */

import Ajv2020 from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generateSchemas } from "../../scripts/generate-schemas.js";
import committedProject from "../../schema/project.json" with { type: "json" };
import committedEffectPack from "../../schema/effect-pack.json" with { type: "json" };
import committedTypewriterParams from "../../schema/typewriter-params.json" with { type: "json" };
import committedFadeSlideParams from "../../schema/fade-slide-params.json" with { type: "json" };
import {
  arbFadeSlideParams,
  arbTypewriterParams,
  arbValidEffectPack,
  arbValidProject,
} from "../testing/arbitraries.js";

/**
 * The committed schema documents, keyed by their file name — the same keys
 * `generateSchemas()` returns. Imported as JSON modules so no Node `fs` access
 * or `@types/node` dependency is needed.
 */
const COMMITTED_SCHEMAS: Record<string, unknown> = {
  "project.json": committedProject,
  "effect-pack.json": committedEffectPack,
  "typewriter-params.json": committedTypewriterParams,
  "fade-slide-params.json": committedFadeSlideParams,
};

/** Returns the committed, parsed schema object for `fileName`. */
function readCommittedSchema(fileName: string): unknown {
  const schema = COMMITTED_SCHEMAS[fileName];
  if (schema === undefined) {
    throw new Error(`No committed schema import for "${fileName}".`);
  }
  return schema;
}

/** Compiles a generated schema with a fresh draft-2020-12 AJV instance. */
function compile(schema: unknown): ValidateFunction {
  const ajv = new Ajv2020({ strict: false });
  return ajv.compile(schema as AnySchema);
}

/**
 * Validates every sampled document against `validate`, asserting each one
 * passes. Surfaces AJV's error output in the failure message when a document is
 * unexpectedly rejected.
 */
function expectAllValid(validate: ValidateFunction, documents: unknown[], label: string): void {
  for (const doc of documents) {
    const ok = validate(doc);
    if (!ok) {
      throw new Error(
        `${label}: a sampled valid document failed JSON Schema validation.\n` +
          `AJV errors: ${JSON.stringify(validate.errors, null, 2)}\n` +
          `Document: ${JSON.stringify(doc)}`,
      );
    }
    expect(ok).toBe(true);
  }
}

describe("JSON Schema staleness", () => {
  it("every committed schema file matches generateSchemas() output", () => {
    const generated = generateSchemas();

    for (const [fileName, schema] of Object.entries(generated)) {
      const committed = readCommittedSchema(fileName);
      // Structural deep-equality: parsed committed JSON vs generated object, so
      // whitespace/formatting is not the thing under test.
      expect(
        committed,
        `schema/${fileName} is stale — re-run \`pnpm --filter @studio/engine generate-schemas\` and commit the result.`,
      ).toStrictEqual(schema);
    }
  });
});

describe("generated JSON Schemas validate real documents (AJV, draft 2020-12)", () => {
  it("project.json accepts valid projects", () => {
    const validate = compile(readCommittedSchema("project.json"));
    const documents = fc.sample(arbValidProject, 5);
    expectAllValid(validate, documents, "project.json");
  });

  it("effect-pack.json accepts valid effect packs", () => {
    const validate = compile(readCommittedSchema("effect-pack.json"));
    const documents = fc.sample(arbValidEffectPack, 5);
    expectAllValid(validate, documents, "effect-pack.json");
  });

  it("typewriter-params.json accepts valid typewriter params", () => {
    const validate = compile(readCommittedSchema("typewriter-params.json"));
    const documents = fc.sample(arbTypewriterParams, 5);
    expectAllValid(validate, documents, "typewriter-params.json");
  });

  it("fade-slide-params.json accepts valid fade-slide params", () => {
    const validate = compile(readCommittedSchema("fade-slide-params.json"));
    const documents = fc.sample(arbFadeSlideParams, 5);
    expectAllValid(validate, documents, "fade-slide-params.json");
  });
});
