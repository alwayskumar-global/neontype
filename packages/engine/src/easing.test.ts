import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate, type Easing } from "./easing.js";

const continuousEasings: Easing[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
];

const allEasings: Easing[] = [...continuousEasings, { type: "step", steps: 4 }];

describe("evaluate — boundaries", () => {
  it("returns exactly a at p=0 and exactly b at p=1 for every easing type", () => {
    const a = 10;
    const b = 50;
    for (const easing of allEasings) {
      expect(evaluate(easing, a, b, 0)).toBe(a);
      expect(evaluate(easing, a, b, 1)).toBe(b);
    }
  });
});

describe("evaluate — linear", () => {
  it("maps p=0 to a, p=0.5 to the midpoint, and p=1 to b", () => {
    const a = 0;
    const b = 10;
    expect(evaluate("linear", a, b, 0)).toBe(a);
    expect(evaluate("linear", a, b, 0.5)).toBe(5);
    expect(evaluate("linear", a, b, 1)).toBe(b);
  });
});

describe("evaluate — easeIn (cubic)", () => {
  it("has exact boundaries and an interior value consistent with p^3", () => {
    const a = 0;
    const b = 10;
    expect(evaluate("easeIn", a, b, 0)).toBe(a);
    expect(evaluate("easeIn", a, b, 1)).toBe(b);
    // eased = 0.5^3 = 0.125 → 0 + 10 * 0.125 = 1.25
    expect(evaluate("easeIn", a, b, 0.5)).toBeCloseTo(1.25, 10);
  });
});

describe("evaluate — easeOut (cubic)", () => {
  it("has exact boundaries and an interior value consistent with 1-(1-p)^3", () => {
    const a = 0;
    const b = 10;
    expect(evaluate("easeOut", a, b, 0)).toBe(a);
    expect(evaluate("easeOut", a, b, 1)).toBe(b);
    // eased = 1 - (1 - 0.5)^3 = 0.875 → 0 + 10 * 0.875 = 8.75
    expect(evaluate("easeOut", a, b, 0.5)).toBeCloseTo(8.75, 10);
  });
});

describe("evaluate — easeInOut (cubic)", () => {
  it("has exact boundaries and is symmetric about the midpoint", () => {
    const a = 0;
    const b = 10;
    expect(evaluate("easeInOut", a, b, 0)).toBe(a);
    expect(evaluate("easeInOut", a, b, 1)).toBe(b);
    // eased = 0.5 at p = 0.5 → midpoint = 5
    expect(evaluate("easeInOut", a, b, 0.5)).toBeCloseTo(5, 10);
  });
});

describe("evaluate — cubicBezier", () => {
  it("returns exactly a at p=0 and exactly b at p=1", () => {
    const easing: Easing = { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    const a = 10;
    const b = 50;
    expect(evaluate(easing, a, b, 0)).toBe(a);
    expect(evaluate(easing, a, b, 1)).toBe(b);
  });

  it("behaves as linear with control points (0,0,1,1)", () => {
    const linearBezier: Easing = { type: "cubicBezier", x1: 0, y1: 0, x2: 1, y2: 1 };
    const a = 0;
    const b = 10;
    for (const p of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      expect(evaluate(linearBezier, a, b, p)).toBeCloseTo(evaluate("linear", a, b, p), 5);
    }
  });
});

describe("evaluate — step", () => {
  it("produces exactly 4 distinct values across p in [0, 1) with steps=4", () => {
    const easing: Easing = { type: "step", steps: 4 };
    const values = new Set<number>();
    for (let p = 0; p < 1; p += 0.01) {
      values.add(evaluate(easing, 0, 1, p));
    }
    expect(values.size).toBe(4);
  });

  it("produces distinct evenly-spaced levels at p=0, 0.25, 0.5, 0.75 with N=4", () => {
    const easing: Easing = { type: "step", steps: 4 };
    const a = 0;
    const b = 3;
    // Levels 0, 1/3, 2/3, 3/3 scaled across [0, 3] are 0, 1, 2, 3 — distinct and evenly spaced.
    expect(evaluate(easing, a, b, 0)).toBe(0);
    expect(evaluate(easing, a, b, 0.25)).toBe(1);
    expect(evaluate(easing, a, b, 0.5)).toBe(2);
    expect(evaluate(easing, a, b, 0.75)).toBe(3);
    const samples = [
      evaluate(easing, a, b, 0),
      evaluate(easing, a, b, 0.25),
      evaluate(easing, a, b, 0.5),
      evaluate(easing, a, b, 0.75),
    ];
    expect(new Set(samples).size).toBe(4);
  });

  it("returns exactly b at p=1 with N=4", () => {
    const easing: Easing = { type: "step", steps: 4 };
    expect(evaluate(easing, 0, 3, 1)).toBe(3);
  });
});

/** An arbitrary covering every `Easing` variant. */
const arbEasing: fc.Arbitrary<Easing> = fc.oneof(
  fc.constantFrom<Easing>("linear", "easeIn", "easeOut", "easeInOut"),
  fc.record({
    type: fc.constant("cubicBezier" as const),
    x1: fc.float({ min: 0, max: 1, noNaN: true }),
    y1: fc.float({ min: 0, max: 1, noNaN: true }),
    x2: fc.float({ min: 0, max: 1, noNaN: true }),
    y2: fc.float({ min: 0, max: 1, noNaN: true }),
  }),
  fc.record({
    type: fc.constant("step" as const),
    steps: fc.integer({ min: 1, max: 64 }),
  }),
);

describe("evaluate — invariant", () => {
  // Feature: engine-core, Property 7: Easing invariant — finite output
  it("returns a finite number (no NaN or Infinity) for any easing, a, b, and p in [0, 1]", () => {
    fc.assert(
      fc.property(
        arbEasing,
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (easing, a, b, p) => {
          expect(Number.isFinite(evaluate(easing, a, b, p))).toBe(true);
        },
      ),
    );
  });
});
