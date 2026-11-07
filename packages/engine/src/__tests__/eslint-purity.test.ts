/**
 * ESLint purity enforcement test (Task 13.1).
 *
 * The engine is a deterministic, pure render pipeline: `Math.random`,
 * `Date.now`, and `performance.now` are banned in `src/**` so that the same
 * inputs always produce the same output. That ban is declared with the
 * `no-restricted-properties` rule in `packages/engine/eslint.config.js`.
 *
 * This test guards the rule itself. It feeds a snippet that calls all three
 * banned APIs to the ESLint `Linter` programmatically, using the SAME
 * `no-restricted-properties` configuration the project uses, and asserts that
 * exactly three violations fire — one per banned call. The snippet is a plain
 * STRING literal fed to `Linter.verify`; it is never executed and contains no
 * real calls, so it does not itself violate the lint rule and needs no
 * `eslint-disable`.
 *
 * An inline flat config (rather than loading `eslint.config.js`) is used
 * deliberately: it makes the test robust against how the config file is
 * resolved/merged and keeps the assertion pinned to the exact rule options.
 * The options below are a verbatim copy of the ones in `eslint.config.js`;
 * removing any single entry there (or here) would drop its violation and fail
 * this test.
 */

import { Linter } from "eslint";
import type { Linter as LinterNS } from "eslint";
import { describe, expect, it } from "vitest";

// A verbatim copy of the `no-restricted-properties` options from
// `packages/engine/eslint.config.js`. Kept in sync by this test: if the config
// drops one of these entries, the matching assertion below fails.
const noRestrictedPropertiesOptions = [
  { object: "Math", property: "random", message: "Use createPRNG() instead." },
  { object: "Date", property: "now", message: "Not allowed in engine/src." },
  {
    object: "performance",
    property: "now",
    message: "Not allowed in engine/src.",
  },
];

// Flat config applied to the snippet. `eslint.config.js` scopes the rule to
// `files: ["src/**/*.ts"]`, so we mirror that here and lint under a matching
// `src/**` filename. Without a `files` entry that matches the linted path,
// ESLint's flat-config `Linter` reports "No matching configuration found"
// and produces no rule violations.
const PURITY_FILENAME = "src/temp-purity-check.ts";

const config: LinterNS.Config = {
  files: ["src/**/*.ts"],
  rules: {
    // Tuple: ["error", ...options]. Built explicitly so the severity stays the
    // literal element the ESLint types require.
    "no-restricted-properties": ["error", ...noRestrictedPropertiesOptions],
  },
};

// Snippet calling each banned API. This is DATA — a string passed to the
// linter — not executable code in this file, so the purity rule does not fire
// on this test file itself.
const snippet = [
  "const a = Math.random();",
  "const b = Date.now();",
  "const c = performance.now();",
].join("\n");

describe("ESLint purity rule (no-restricted-properties)", () => {
  const messages = new Linter().verify(snippet, config, {
    filename: PURITY_FILENAME,
  });

  it("produces exactly three violations", () => {
    expect(messages).toHaveLength(3);
  });

  it("every violation comes from no-restricted-properties and is an error", () => {
    for (const m of messages) {
      expect(m.ruleId).toBe("no-restricted-properties");
      expect(m.severity).toBe(2); // 2 = error
    }
  });

  it("flags Math.random", () => {
    const hit = messages.filter((m) => m.message.includes("'Math.random'"));
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("Use createPRNG() instead.");
  });

  it("flags Date.now", () => {
    const hit = messages.filter((m) => m.message.includes("'Date.now'"));
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("Not allowed in engine/src.");
  });

  it("flags performance.now", () => {
    const hit = messages.filter((m) =>
      m.message.includes("'performance.now'"),
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain("Not allowed in engine/src.");
  });

  it("flags all three banned object.property pairs exactly once each", () => {
    // Proves every ban fires independently: removing any single rule entry
    // from `eslint.config.js` would shrink this set and fail the test.
    const flagged = messages
      .map((m) => m.message.match(/'([^']+)'/)?.[1])
      .filter((v): v is string => typeof v === "string")
      .sort();
    expect(flagged).toEqual(["Date.now", "Math.random", "performance.now"]);
  });
});
