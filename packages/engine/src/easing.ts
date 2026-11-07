/**
 * Easing evaluation.
 *
 * `evaluate(easing, a, b, p)` interpolates between `a` and `b` using the eased
 * progress of `p` (with `p` in [0, 1]). For every variant the boundaries are
 * exact: at `p = 0` the result is exactly `a`, and at `p = 1` the result is
 * exactly `b`. Between the boundaries the curve shapes the progress before the
 * linear blend `a + (b - a) * eased`.
 *
 * This module is pure: it never calls `Math.random`, `Date.now`, or
 * `performance.now`. All outputs are finite for any valid `(a, b, p)` with `p`
 * in [0, 1].
 *
 * NOTE: the `Easing` type is defined locally here for now. A later task
 * introduces `EasingSchema` in `schemas/keyframe.ts` and re-points this type to
 * the schema-derived type; the shape below matches the design exactly so that
 * swap is seamless.
 */

/** A named or parameterised interpolation curve. */
export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | { type: "cubicBezier"; x1: number; y1: number; x2: number; y2: number }
  | { type: "step"; steps: number };

/** Clamps `p` into the closed unit interval [0, 1]. */
function clampProgress(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return p;
}

/** Cubic ease-in: slow start, `p^3`. */
function easeInCubic(p: number): number {
  return p * p * p;
}

/** Cubic ease-out: fast start, `1 - (1 - p)^3`. */
function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}

/** Cubic ease-in-out: slow start and end. */
function easeInOutCubic(p: number): number {
  if (p < 0.5) {
    return 4 * p * p * p;
  }
  const q = -2 * p + 2;
  return 1 - (q * q * q) / 2;
}

/**
 * Evaluates the x-coordinate of a cubic Bézier curve with implicit endpoints
 * (0, 0) and (1, 1) and control x-values `x1`, `x2` at parameter `t`.
 */
function bezierX(t: number, x1: number, x2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
}

/** Evaluates the y-coordinate of the same cubic Bézier at parameter `t`. */
function bezierY(t: number, y1: number, y2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

/**
 * Solves the parametric cubic Bézier for the `t` where `x(t) = p`, using a
 * binary search over `t` in [0, 1]. The x-curve is monotonic for control
 * points in [0, 1], so a bisection converges reliably and cannot diverge the
 * way Newton–Raphson can near flat regions. Returns the eased `y(t)`.
 */
function cubicBezier(p: number, x1: number, y1: number, x2: number, y2: number): number {
  let lo = 0;
  let hi = 1;
  let t = p;
  for (let i = 0; i < 32; i++) {
    t = (lo + hi) / 2;
    const x = bezierX(t, x1, x2);
    if (x < p) {
      lo = t;
    } else {
      hi = t;
    }
  }
  return bezierY(t, y1, y2);
}

/**
 * Maps progress `p` to one of exactly `N` discrete eased levels.
 *
 * Convention (step-start / jumps): for `p` in [0, 1) the level is
 * `min(floor(p * N), N - 1)`, giving exactly `N` distinct integer levels
 * `0 .. N - 1`. The eased value is `level / (N - 1)` for `N > 1`, so the levels
 * are evenly spaced across [0, 1]. For `N = 1` there is a single level, so the
 * eased value is `0` for all `p` in [0, 1) (the output never leaves `a` until
 * the exact end). The caller handles `p = 1` by returning exactly `b`, so this
 * function is only reached for `p` in [0, 1).
 */
function stepEased(p: number, steps: number): number {
  if (steps <= 1) return 0;
  const level = Math.min(Math.floor(p * steps), steps - 1);
  return level / (steps - 1);
}

/**
 * Interpolates between `a` and `b` using `easing` at progress `p`.
 *
 * `p` is clamped to [0, 1]. At `p = 0` the result is exactly `a`; at `p = 1`
 * the result is exactly `b`, for every easing variant. The output is always a
 * finite number for valid inputs.
 */
export function evaluate(easing: Easing, a: number, b: number, p: number): number {
  const progress = clampProgress(p);

  if (typeof easing === "object" && easing.type === "step") {
    if (progress >= 1) return b;
    return a + (b - a) * stepEased(progress, easing.steps);
  }

  // Exact boundaries for every continuous variant.
  if (progress === 0) return a;
  if (progress === 1) return b;

  let eased: number;
  if (easing === "linear") {
    eased = progress;
  } else if (easing === "easeIn") {
    eased = easeInCubic(progress);
  } else if (easing === "easeOut") {
    eased = easeOutCubic(progress);
  } else if (easing === "easeInOut") {
    eased = easeInOutCubic(progress);
  } else {
    eased = cubicBezier(progress, easing.x1, easing.y1, easing.x2, easing.y2);
  }

  return a + (b - a) * eased;
}
