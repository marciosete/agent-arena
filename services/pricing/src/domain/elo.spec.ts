import { describe, expect, it } from 'vitest';
import { winProbability } from './elo';

describe('winProbability', () => {
  it('gives even teams a 50% chance', () => {
    expect(winProbability(1900, 1900)).toBe(0.5);
  });

  it('matches the logistic expectation for France (2100) v Paraguay (1750)', () => {
    expect(winProbability(2100, 1750)).toBeCloseTo(0.8823, 3);
  });

  it('gives a +400 Elo edge a 10/11 expectation', () => {
    expect(winProbability(2100, 1700)).toBeCloseTo(10 / 11, 10);
  });

  it('is symmetric: both probabilities sum to 1', () => {
    expect(winProbability(2050, 1830) + winProbability(1830, 2050)).toBeCloseTo(1, 12);
  });

  it('always favours the higher-rated team', () => {
    expect(winProbability(1901, 1900)).toBeGreaterThan(0.5);
    expect(winProbability(1899, 1900)).toBeLessThan(0.5);
  });
});
