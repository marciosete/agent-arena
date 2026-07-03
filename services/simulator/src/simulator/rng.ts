/**
 * Seedable pseudo-random number generator (mulberry32). The simulation must be
 * deterministic under a fixed seed so results are reproducible in tests; a
 * cryptographic source would make that impossible (and is not needed — this
 * randomness decides match results, not secrets).
 */
export type Rng = () => number;

/** Returns a generator of uniform floats in [0, 1) from a 32-bit seed. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
