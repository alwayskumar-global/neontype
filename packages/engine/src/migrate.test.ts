/**
 * Unit tests for `migrateProject` (Task 4.1 + Task 4.2 completion criteria):
 * - a raw object whose `schemaVersion` exceeds `CURRENT_PROJECT_VERSION` returns
 *   a `MigrationError` and does NOT throw (R2.3);
 * - a valid version-1 document returns a validated `Project`, not an error
 *   (R2.1, R2.4);
 * - the committed `project-v1.json` fixture migrates and validates (R2.5, R11.5);
 * - a synthetic version-0 → version-1 migration driven by a custom
 *   `MigrationMap` exercises the ordered-apply loop (R2.2, R2.6);
 * - `migrateProject({ schemaVersion: 999 })` returns a `MigrationError` with
 *   `code: "FUTURE_VERSION"` (R2.3).
 *
 * Fixture read decision: `project-v1.json` is imported directly as a module.
 * This is enabled by the single `resolveJsonModule` flag added to the engine
 * tsconfig; no Node built-ins (`fs`/`url`) and no `@types/node` dependency are
 * involved, so the read is synchronous and deterministic. The imported value is
 * treated as untrusted and cast via `unknown` before it is handed to
 * `migrateProject`.
 */

import { describe, expect, it } from "vitest";

import { MigrationError } from "./errors.js";
import { migrateProject, type MigrationMap } from "./migrate.js";
import { ProjectSchema, type Project } from "./schemas/project.js";
import projectV1Fixture from "./testing/fixtures/project-v1.json";

/** A realistic valid version-1 project (same shape as the serialize fixture). */
function makeValidProject(): Project {
  return {
    schemaVersion: 1,
    canvas: { width: 1920, height: 1080, fps: 30, durationSeconds: 10 },
    background: "#000000",
    seed: 42,
    layers: [
      {
        id: "layer-1",
        text: "Hello",
        tracks: [
          {
            property: "position",
            keyframes: [
              {
                t: 0,
                value: [0, 0],
                easing: { type: "cubicBezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
              },
              { t: 1, value: [100, 50], easing: "linear" },
            ],
          },
        ],
        effectInstances: [
          { effectId: "typewriter", granularity: "character", params: { delayPerCharacter: 0.05 } },
        ],
        fontFamily: "Inter",
        fontSize: 48,
        fontWeight: "700",
        fill: "#ff00aa",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: 1280,
        startSeconds: 0,
        endSeconds: 2,
        anchor: { x: 960, y: 540 },
      },
    ],
  };
}

describe("migrateProject", () => {
  it("returns a MigrationError for a schemaVersion above CURRENT_PROJECT_VERSION without throwing", () => {
    let result: ReturnType<typeof migrateProject>;
    expect(() => {
      result = migrateProject({ schemaVersion: 2 });
    }).not.toThrow();

    expect(result!).toBeInstanceOf(MigrationError);
    expect((result! as MigrationError).code).toBe("FUTURE_VERSION");
    expect((result! as MigrationError).version).toBe(2);
  });

  it("returns a validated Project for a valid version-1 document", () => {
    const project = makeValidProject();
    const result = migrateProject(project);

    expect(result).not.toBeInstanceOf(MigrationError);
    expect(result).toEqual(project);
  });

  it("migrates the committed project-v1.json fixture to a Project that passes ProjectSchema.safeParse", () => {
    const result = migrateProject(projectV1Fixture as unknown);

    expect(result).not.toBeInstanceOf(MigrationError);
    // Re-validate the returned Project to confirm it satisfies the schema (R2.5, R11.5).
    expect(ProjectSchema.safeParse(result).success).toBe(true);
  });

  it("applies a custom MigrationMap to migrate a synthetic version-0 document to a valid version-1 Project", () => {
    // A version-0 document: a complete v1-shaped project but stamped schemaVersion 0,
    // so it is NOT valid at v1 (ProjectSchema requires a positive version) until the step runs.
    const rawV0: Record<string, unknown> = { ...makeValidProject(), schemaVersion: 0 };

    // The step climbs v0 → v1 by stamping the current schema version.
    const migrations: MigrationMap = new Map([
      [0, (raw) => ({ ...raw, schemaVersion: 1 })],
    ]);

    const result = migrateProject(rawV0, migrations);

    expect(result).not.toBeInstanceOf(MigrationError);
    expect(ProjectSchema.safeParse(result).success).toBe(true);
    expect((result as Project).schemaVersion).toBe(1);
  });

  it("returns a FUTURE_VERSION MigrationError for schemaVersion 999", () => {
    const result = migrateProject({ schemaVersion: 999 });

    expect(result).toBeInstanceOf(MigrationError);
    expect((result as MigrationError).code).toBe("FUTURE_VERSION");
    expect((result as MigrationError).version).toBe(999);
  });
});
