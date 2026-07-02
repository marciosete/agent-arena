/** A pseudo-random source yielding floats in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a tiny, fast, seedable PRNG. The Monte Carlo outright must be
 * reproducible under a fixed seed (Math.random is not seedable), so tests and
 * successive reprices are deterministic.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
