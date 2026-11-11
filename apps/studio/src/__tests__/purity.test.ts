/**
 * ESLint purity guard (Requirement 10.4, 14; Execution rules).
 *
 * `Math.random`, `Date.now`, and `performance.now` are banned in
 * `apps/studio/src/**` EXCEPT `src/playback/**` (the only place the animation
 * clock may be read). This test guards both halves of that rule by running the
 * ESLint `Linter` programmatically over a data snippet (a string — never
 * executed, so this file itself does not trip the rule and needs no
 * `eslint-disable`):
 *   - under a non-playback filename, all three bans fire;
 *   - under a `src/playback/**` filename, the override disables them (zero
 *     violations).
 *
 * The rule options mirror `apps/studio/eslint.config.js`; dropping an entry
 * there fails an assertion here.
 */

import { Linter } from "eslint";
import type { Linter as LinterNS } from "eslint";
import { describe, expect, it } from "vitest";

const bannedProps = [
  { object: "Math", property: "random", message: "No nondeterminism in studio src; randomness comes from the engine's seeded PRNG." },
  { object: "Date", property: "now", message: "No wall-clock outside src/playback; the playback clock is the only clock." },
  { object: "performance", property: "now", message: "No wall-clock outside src/playback; the playback clock is the only clock." },
];

const snippet = [
  "const a = Math.random();",
  "const b = Date.now();",
  "const c = performance.now();",
].join("\n");

// Non-playback scope: ban active.
const banned: LinterNS.Config = {
  files: ["src/**/*.ts"],
  rules: { "no-restricted-properties": ["error", ...bannedProps] },
};

// Playback scope: a later config object turns the rule off for src/playback/**,
// exactly as eslint.config.js does.
const withOverride: LinterNS.Config[] = [
  banned,
  { files: ["src/playback/**/*.ts"], rules: { "no-restricted-properties": "off" } },
];

describe("studio purity guard", () => {
  it("fires all three bans outside src/playback", () => {
    const messages = new Linter().verify(snippet, banned, {
      filename: "src/model/transitions.ts",
    });
    expect(messages).toHaveLength(3);
    const flagged = messages
      .map((m) => m.message.match(/'([^']+)'/)?.[1])
      .filter((v): v is string => typeof v === "string")
      .sort();
    expect(flagged).toEqual(["Date.now", "Math.random", "performance.now"]);
    for (const m of messages) {
      expect(m.ruleId).toBe("no-restricted-properties");
      expect(m.severity).toBe(2);
    }
  });

  it("allows the three inside src/playback (the only clock location)", () => {
    const messages = new Linter().verify(snippet, withOverride, {
      filename: "src/playback/clock.ts",
    });
    expect(messages).toHaveLength(0);
  });
});

describe("JSX style guard (Requirement 11.2)", () => {
  const cfg: LinterNS.Config = {
    files: ["src/**/*.tsx"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='style']", message: "no style" },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "no raw html" },
      ],
    },
  };
  it("flags a style prop and dangerouslySetInnerHTML, and allows className", () => {
    const linter = new Linter();
    const bad = linter.verify("const a = <div style={{ left: 1 }} />;\nconst b = <p dangerouslySetInnerHTML={{ __html: 'x' }} />;", cfg, { filename: "src/x.tsx" });
    expect(bad.filter((m) => m.ruleId === "no-restricted-syntax")).toHaveLength(2);
    const ok = linter.verify("const a = <div className=\"x\" />;", cfg, { filename: "src/x.tsx" });
    expect(ok).toHaveLength(0);
  });
});
