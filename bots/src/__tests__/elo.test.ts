import { describe, expect, it } from 'vitest';
import { eloWinProbability } from '../elo';

describe('eloWinProbability', () => {
  it('gives equal teams a coin flip', () => {
    expect(eloWinProbability(1850, 1850)).toBe(0.5);
  });

  it('gives a 400-point favourite roughly 10-to-1 on', () => {
    expect(eloWinProbability(2100, 1700)).toBeCloseTo(1 / 1.1, 4);
  });

  it('is symmetric: both sides sum to certainty', () => {
    const p = eloWinProbability(2000, 1780);
    const q = eloWinProbability(1780, 2000);
    expect(p).toBeGreaterThan(0.5);
    expect(p + q).toBeCloseTo(1, 10);
  });

  it('steepens with a smaller divisor — the same gap means a stronger favourite', () => {
    const classic = eloWinProbability(2100, 1750);
    const steep = eloWinProbability(2100, 1750, 250);
    expect(steep).toBeGreaterThan(classic);
    expect(steep).toBeCloseTo(0.9617, 3);
    expect(eloWinProbability(1850, 1850, 250)).toBe(0.5); // coin flips stay coin flips
  });
});
