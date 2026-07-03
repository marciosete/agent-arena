import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng (mulberry32)', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it('emits values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const rng = createRng(123);
    let sum = 0;
    const draws = 10_000;
    for (let i = 0; i < draws; i += 1) {
      sum += rng();
    }
    expect(sum / draws).toBeCloseTo(0.5, 1);
  });
});
