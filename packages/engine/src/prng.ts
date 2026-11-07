/**
 * Deterministic, cross-platform pseudo-random number generation.
 *
 * The engine must be fully deterministic: the same inputs produce identical
 * output in the same runtime. All randomness flows through this module — a
 * mulberry32 generator seeded by a 32-bit FNV-1a hash. Both use `Math.imul`
 * for 32-bit integer multiplication that is identical across JS engines.
 *
 * `Math.random` is never called here (nor anywhere else in `src/`).
 */

/** A deterministic pseudo-random number source. */
export interface PRNG {
  /** Returns the next value in the half-open interval [0, 1). */
  next(): number;
}

/**
 * 32-bit FNV-1a hash of a string.
 *
 * Offset basis `0x811c9dc5`, prime `0x01000193`. Each UTF-16 code unit of the
 * input is XORed into the running hash before the prime multiply. Returns an
 * unsigned 32-bit integer.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Creates a mulberry32 PRNG from a 32-bit seed. Each call to `next()` advances
 * the generator and returns a value in [0, 1). A fresh generator with the same
 * seed reproduces the identical sequence.
 */
export function createPRNG(seed: number): PRNG {
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Derives a per-segment PRNG from the project seed and a segment's identity.
 *
 * The identity tuple is hashed with FNV-1a over its JSON encoding, so distinct
 * layers, effect instances, granularities, or segments yield independent
 * sequences. Using `JSON.stringify` of an array avoids delimiter ambiguity when
 * `layerId` contains special characters.
 */
export function derivePRNG(
  seed: number,
  layerId: string,
  effectInstanceIndex: number,
  granularity: string,
  segmentIndex: number,
): PRNG {
  const hash = fnv1a32(
    JSON.stringify([seed, layerId, effectInstanceIndex, granularity, segmentIndex]),
  );
  return createPRNG(hash);
}
