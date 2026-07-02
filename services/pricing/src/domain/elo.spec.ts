import { describe, expect, it } from 'vitest';
import { winProbability } from './elo';

describe('winProbability', () => {
  it('gives exactly 0.5 to equally rated teams', () => {
    expect(winProbability(1800, 1800)).toBe(0.5);
  });

  it('is complementary: p(a beats b) + p(b beats a) = 1', () => {
    const pairs = [
      [2100, 1750],
      [1850, 1950],
      [1550, 2150],
    ];
    for (const [a, b] of pairs) {
      expect(winProbability(a, b) + winProbability(b, a)).toBeCloseTo(1, 12);
    }
  });

  it('matches the canonical logistic value for a 400-point gap', () => {
    // Elo's defining property: +400 points ⇒ 10:1 expectation.
    expect(winProbability(2000, 1600)).toBeCloseTo(10 / 11, 12);
    expect(winProbability(1600, 2000)).toBeCloseTo(1 / 11, 12);
  });

  it('makes France (2100) heavy favourites over Paraguay (1750)', () => {
    expect(winProbability(2100, 1750)).toBeCloseTo(0.8823, 3);
  });

  it('increases monotonically with the rating gap', () => {
    const gaps = [0, 50, 150, 300, 600];
    const probabilities = gaps.map((gap) => winProbability(1800 + gap, 1800));
    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]).toBeGreaterThan(probabilities[i - 1]);
    }
  });
});
