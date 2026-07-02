/**
 * Deterministic pseudo-random numbers for the simulation. Seedable BY DESIGN:
 * the spec requires reproducible results under a fixed seed (deterministic
 * tests, replayable theatre). Mulberry32 is tiny, fast, and plenty for
 * generating fixture results — this is showmanship, not cryptography.
 */

/** Uniform-[0,1) generator; every call advances the internal state. */
export type Rng = () => number;

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
