import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeProject, parseProject, ParseError, CURRENT_PROJECT_VERSION } from "@studio/engine";
import { arbProject } from "../model/__testing/arb-project.js";

// Feature: studio, Property 4: Save/load round-trip
describe("Property 4: Save/load round-trip", () => {
  it("parseProject(serializeProject(p)) deep-equals p and carries schemaVersion", () => {
    fc.assert(
      fc.property(arbProject, (p) => {
        const round = parseProject(serializeProject(p));
        expect(round).not.toBeInstanceOf(ParseError);
        if (round instanceof ParseError) return;
        expect(round).toEqual(p);
        expect(round.schemaVersion).toBe(CURRENT_PROJECT_VERSION);
      }),
      { numRuns: 200 },
    );
  });
});
