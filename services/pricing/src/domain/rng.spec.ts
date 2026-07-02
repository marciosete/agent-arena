import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('yields a reproducible stream in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('yields different streams for different seeds', () => {
    const first = Array.from({ length: 10 }, mulberry32(1));
    const second = Array.from({ length: 10 }, mulberry32(2));
    expect(first).not.toEqual(second);
  });

  it('spreads roughly uniformly across [0, 1)', () => {
    const rng = mulberry32(99);
    const samples = Array.from({ length: 10_000 }, rng);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
