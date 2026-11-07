/**
 * Project schema migration (R2.1–R2.6).
 *
 * `migrateProject` is the single entry point for upgrading a raw, untrusted
 * project document to a validated `Project` at `CURRENT_PROJECT_VERSION`. Like
 * `parseProject`, it is total and NEVER throws for the version checks: every
 * recoverable data problem is surfaced as a returned `MigrationError` that the
 * caller discriminates via `instanceof MigrationError` or its `.code`.
 *
 * Version handling:
 * - `schemaVersion > CURRENT_PROJECT_VERSION` → `MigrationError` (R2.3). The
 *   document was written by a newer engine; the user needs a newer build.
 * - `schemaVersion === CURRENT_PROJECT_VERSION` → validate with
 *   `ProjectSchema.safeParse` and return the typed `Project`; no steps run
 *   (R2.4).
 * - `schemaVersion < CURRENT_PROJECT_VERSION` → apply each migration step from
 *   version N up to (but not including) `CURRENT_PROJECT_VERSION` in strict
 *   order, then validate the final object (R2.2).
 *
 * The `migrations` map is an optional override (R2.6): production callers omit
 * it and get the built-in steps; tests pass a synthetic map to drive
 * multi-step chains against synthetic versions. Since `CURRENT_PROJECT_VERSION`
 * is currently `1`, there are no built-in downward-from steps yet — the
 * ordered-apply loop below is already general so a future version N > 1 (and
 * Task 4.2's synthetic version-0 fixture) drives it without a rewrite.
 *
 * Documented edge-case decisions (the return type is `Project | MigrationError`,
 * so every non-success path resolves to a `MigrationError`):
 * - Missing / non-numeric / non-integer `schemaVersion`: the document does not
 *   declare a usable version, so there is no migration path. Returns a
 *   `MigrationError` with `version: NaN` rather than throwing.
 * - A document already at `CURRENT_PROJECT_VERSION` that fails schema
 *   validation: returned as a `MigrationError` describing that the document
 *   does not validate at the current version.
 * - A step required to climb from N to `CURRENT_PROJECT_VERSION` is absent from
 *   the `migrations` map (and no built-in step exists): returns a
 *   `MigrationError` describing the missing step ("no migration path").
 */

import { MigrationError } from "./errors.js";
import { CURRENT_PROJECT_VERSION } from "./schemas/constants.js";
import { ProjectSchema, type Project } from "./schemas/project.js";

/** Upgrades a raw project object from version N to version N+1. */
export type MigrationFn = (
  raw: Record<string, unknown>,
) => Record<string, unknown>;

/** Maps a source version number to the step that upgrades it to the next version. */
export type MigrationMap = Map<number, MigrationFn>;

/** Narrow an unknown value to a plain object usable as a raw project record. */
function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

/**
 * Migrate a raw project document to a validated `Project` at
 * `CURRENT_PROJECT_VERSION` (R2.1–R2.6).
 *
 * Returns the typed `Project` on success, or a `MigrationError` on any failure.
 * This function never throws for the version checks.
 */
export function migrateProject(
  raw: unknown,
  migrations?: MigrationMap,
): Project | MigrationError {
  const record = asRecord(raw);
  if (record === null) {
    return new MigrationError(
      "Project document is not a JSON object and declares no schemaVersion.",
      Number.NaN,
    );
  }

  const version = record.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return new MigrationError(
      "Project document is missing a valid integer schemaVersion.",
      Number.NaN,
    );
  }

  if (version > CURRENT_PROJECT_VERSION) {
    return new MigrationError(
      `Project schemaVersion ${version} is newer than the engine supports ` +
        `(CURRENT_PROJECT_VERSION = ${CURRENT_PROJECT_VERSION}). Upgrade the engine to open it.`,
      version,
    );
  }

  if (version === CURRENT_PROJECT_VERSION) {
    const result = ProjectSchema.safeParse(record);
    if (result.success) {
      return result.data;
    }
    return new MigrationError(
      `Project document at schemaVersion ${version} does not validate against the current schema.`,
      version,
    );
  }

  // version < CURRENT_PROJECT_VERSION: climb one step at a time, N → N+1 → … →
  // CURRENT_PROJECT_VERSION, never skipping a step (R2.2).
  let current: Record<string, unknown> = record;
  for (let v = version; v < CURRENT_PROJECT_VERSION; v++) {
    const step = migrations?.get(v);
    if (step === undefined) {
      return new MigrationError(
        `No migration path from schemaVersion ${v} to ${v + 1}.`,
        version,
      );
    }
    current = step(current);
  }

  const result = ProjectSchema.safeParse(current);
  if (result.success) {
    return result.data;
  }
  return new MigrationError(
    `Migrated project from schemaVersion ${version} does not validate against the current schema.`,
    version,
  );
}
