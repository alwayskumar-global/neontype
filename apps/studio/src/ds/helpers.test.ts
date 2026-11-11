import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { clampRound, stepNumber, tokenizeCode } from "./helpers.js";

describe("stepNumber", () => {
  it("steps by 1, Shift x10, Alt x0.1, in either direction", () => {
    expect(stepNumber(10, 1, 1, {}, -Infinity, Infinity, 0)).toBe(11);
    expect(stepNumber(10, -1, 1, {}, -Infinity, Infinity, 0)).toBe(9);
    expect(stepNumber(10, 1, 1, { shift: true }, -Infinity, Infinity, 0)).toBe(20);
    expect(stepNumber(1, 1, 1, { alt: true }, -Infinity, Infinity, 1)).toBe(1.1);
  });
  it("clamps to min..max and rounds to precision", () => {
    expect(stepNumber(99, 1, 5, {}, 0, 100, 0)).toBe(100);
    expect(stepNumber(1, -1, 5, {}, 0, 100, 0)).toBe(0);
    expect(stepNumber(0.1, 1, 0.2, {}, 0, 10, 2)).toBe(0.3);
    expect(clampRound(1.2345, 0, 10, 2)).toBe(1.23);
  });
  it("property: the result is always within [min, max]", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.constantFrom(1, -1), fc.integer({ min: 1, max: 50 }), fc.boolean(), fc.boolean(), (v, d, step, shift, alt) => {
        const r = stepNumber(v, d, step, { shift, alt }, -100, 100, 1);
        expect(r).toBeGreaterThanOrEqual(-100);
        expect(r).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });
});

describe("tokenizeCode", () => {
  it("classifies comments, tags, attributes and strings", () => {
    const t = tokenizeCode('<!-- hi --><div class="a b">x</div>');
    expect(t.map((x) => [x.kind, x.text])).toEqual([
      ["com", "<!-- hi -->"],
      ["text", "<"],
      ["tag", "div"],
      ["text", " "],
      ["attr", "class"],
      ["text", "="],
      ["str", "\"a b\""],
      ["text", ">x</"],
      ["tag", "div"],
      ["text", ">"],
    ]);
    expect(t.find((x) => x.kind === "com")?.text).toBe("<!-- hi -->");
    expect(t.filter((x) => x.kind === "tag").map((x) => x.text)).toEqual(["div", "div"]);
    expect(t.find((x) => x.kind === "attr")?.text).toBe("class");
    expect(t.find((x) => x.kind === "str")?.text).toBe('"a b"');
  });
  it("keeps a comment atomic (tags inside it are not re-highlighted)", () => {
    const t = tokenizeCode("<!-- <b> -->");
    expect(t).toHaveLength(1);
    expect(t[0]?.kind).toBe("com");
  });
  it("handles an unterminated comment and plain text", () => {
    expect(tokenizeCode("<!-- open").map((x) => x.kind)).toEqual(["com"]);
    expect(tokenizeCode("just text")).toEqual([{ kind: "text", text: "just text" }]);
    expect(tokenizeCode("")).toEqual([]);
  });
  it("property: lossless for arbitrary text, including markup-like strings", () => {
    const piece = fc.constantFrom("<", "</", "<!--", "-->", "div", " ", "a", "=", '"', "x-y", "\n", "<b", ' class="q"');
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.array(piece, { maxLength: 20 }).map((p) => p.join(""))), (code) => {
        expect(tokenizeCode(code).map((t) => t.text).join("")).toBe(code);
      }),
      { numRuns: 400 },
    );
  });
});
