import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ErrorCode } from "@studio/exporters";
import { messageFor, ERROR_MESSAGES } from "./errors.js";

/**
 * The 12 ErrorCode values, listed locally and typed as ErrorCode[] so TypeScript
 * rejects any value that is not a real code (and the `satisfies` check below
 * makes a missing one a compile error against the map's keys). `ERROR_CODES` is
 * not exported from the exporters barrel, so we mirror it here; the compile-time
 * Record<ErrorCode, string> in errors.ts is the primary exhaustiveness guard.
 */
const ALL_CODES = [
  "browser-unsupported", "blur-unsupported", "cancelled", "out-of-memory",
  "invalid-options", "audio-decode-failed", "font-decode-failed", "font-not-ready",
  "empty-frame-range", "encoder-failure", "muxer-failure", "project-invalid",
] as const satisfies readonly ErrorCode[];

// Feature: studio, Property 5: ErrorCode map total
describe("Property 5: ErrorCode map total", () => {
  it("every ErrorCode maps to a non-empty message", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_CODES), (code) => {
        const msg = messageFor(code);
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it("the map has exactly the 12 codes (no extras, none missing)", () => {
    expect(ALL_CODES).toHaveLength(12);
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
  });
});
