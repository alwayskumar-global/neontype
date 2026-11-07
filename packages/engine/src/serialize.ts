/**
 * Project serialization and parsing (R1.8, R1.9).
 *
 * `serializeProject` is the trivial JSON encoder. `parseProject` is the single
 * safe entry point for turning untrusted JSON text back into a validated
 * `Project`: it never throws. Every failure mode — an oversize payload, invalid
 * JSON syntax, or a well-formed document that violates `ProjectSchema` — is
 * surfaced as a returned `ParseError` that callers discriminate via
 * `instanceof ParseError` or its `.code`.
 *
 * Order matters: the byte-size guard runs BEFORE `JSON.parse` so a 5 MB+ string
 * is rejected for size without ever being parsed (R1.8). The limit is 5 MiB
 * (5_242_880 bytes); exactly 5_242_880 bytes is allowed, 5_242_881 is rejected.
 */

import { ParseError } from "./errors.js";
import { ProjectSchema, type Project } from "./schemas/project.js";

/** Maximum accepted project payload, measured in UTF-8 bytes (5 MiB). */
const MAX_PROJECT_BYTES = 5_242_880;

/** Serialize a `Project` to its canonical JSON string form (R1.9). */
export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}

/**
 * Parse untrusted JSON text into a validated `Project` (R1.8, R1.9).
 *
 * Returns the typed `Project` on success, or a `ParseError` on any failure.
 * This function never throws:
 * - oversize input → `code: "SIZE_LIMIT_EXCEEDED"` (checked before parsing)
 * - malformed JSON  → `code: "PARSE_ERROR"`
 * - schema failure  → `code: "PARSE_ERROR"`
 */
export function parseProject(json: string): Project | ParseError {
  if (new TextEncoder().encode(json).byteLength > MAX_PROJECT_BYTES) {
    return new ParseError(
      "Project JSON exceeds the 5 MiB size limit.",
      "SIZE_LIMIT_EXCEEDED",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return new ParseError("Project JSON is not valid JSON.", "PARSE_ERROR", e);
  }

  const result = ProjectSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  return new ParseError("Project failed schema validation.", "PARSE_ERROR", result.error);
}
