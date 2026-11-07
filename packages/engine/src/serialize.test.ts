/**
 * Unit tests for `serializeProject` / `parseProject` (Task 3.5 completion
 * criteria): a known valid project round-trips to a deeply equal object; a
 * 5 MiB + 1 byte payload is rejected with `SIZE_LIMIT_EXCEEDED`; malformed JSON
 * and a schema-invalid (but syntactically valid) document are both rejected
 * with `PARSE_ERROR`; and the function never throws.
 *
 * Round-trip-vs-defaults note: `TextLayerSchema` applies defaults for
 * `letterSpacing` (0) and `lineHeight` (1.2). The fixture below sets both
 * fields explicitly, so parsing applies no defaults and the round-trip is an
 * exact deep equality against the original fixture.
 *
 * The project serialize/parse PBT (Property 1) is added in Task 3.8 and is
 * intentionally out of scope here.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ParseError } from "./errors.js";
import { parseProject, serializeProject } from "./serialize.js";
import { arbValidProject } from "./testing/arbitraries.js";
import type { Project } from "./schemas/project.js";

/** A realistic valid project with letterSpacing/lineHeight set explicitly so a round-trip is exact. */
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

describe("serializeProject / parseProject", () => {
  it("round-trips a known valid project to a deeply equal object", () => {
    const project = makeValidProject();
    const result = parseProject(serializeProject(project));

    expect(result).not.toBeInstanceOf(ParseError);
    expect(result).toEqual(project);
  });

  it("rejects a 5 MiB + 1 byte payload with SIZE_LIMIT_EXCEEDED", () => {
    // 5_242_881 ASCII bytes: not valid JSON, but the size guard runs first.
    const big = "a".repeat(5_242_881);
    expect(new TextEncoder().encode(big).byteLength).toBe(5_242_881);

    const result = parseProject(big);
    expect(result).toBeInstanceOf(ParseError);
    expect((result as ParseError).code).toBe("SIZE_LIMIT_EXCEEDED");
  });

  it("does not reject a payload of exactly 5 MiB for size", () => {
    // Exactly at the limit: allowed by the size guard. It then fails schema
    // validation (PARSE_ERROR), which is fine — the point is it is NOT a size error.
    const atLimit = "a".repeat(5_242_880);
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(5_242_880);

    const result = parseProject(atLimit);
    expect(result).toBeInstanceOf(ParseError);
    expect((result as ParseError).code).not.toBe("SIZE_LIMIT_EXCEEDED");
  });

  it("rejects malformed JSON with PARSE_ERROR without throwing", () => {
    const result = parseProject("{ not valid json");
    expect(result).toBeInstanceOf(ParseError);
    expect((result as ParseError).code).toBe("PARSE_ERROR");
  });

  it("rejects syntactically valid but schema-invalid JSON with PARSE_ERROR", () => {
    const result = parseProject(JSON.stringify({ schemaVersion: "nope" }));
    expect(result).toBeInstanceOf(ParseError);
    expect((result as ParseError).code).toBe("PARSE_ERROR");
  });

  // Feature: engine-core, Property 1: Project serialize/parse round-trip
  it("parseProject(serializeProject(p)) deeply equals p for any valid project", () => {
    fc.assert(
      fc.property(arbValidProject, (p) => {
        const result = parseProject(serializeProject(p));
        expect(result).not.toBeInstanceOf(ParseError);
        expect(result).toEqual(p);
      }),
    );
  });
});
