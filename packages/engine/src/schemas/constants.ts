/**
 * Schema-related constants for the engine.
 *
 * `CURRENT_PROJECT_VERSION` is the latest `schemaVersion` integer that
 * `ProjectSchema` validates (R1.10). Migrations (Group 4) upgrade older
 * documents up to this version.
 */

/** The latest Project `schemaVersion` the engine understands (R1.10). */
export const CURRENT_PROJECT_VERSION = 1;
