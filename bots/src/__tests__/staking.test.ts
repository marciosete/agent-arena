import { describe, expect, it } from 'vitest';
import { kellyFraction, kellyStake } from '../staking';

describe('kellyFraction', () => {
  it('returns the classic Kelly fraction when we have an edge', () => {
    // 60% win probability at evens (2.00): f = (1*0.6 - 0.4) / 1 = 0.2
    expect(kellyFraction(0.6, 2.0)).toBeCloseTo(0.2);
  });

  it('returns 0 when the price offers no edge', () => {
    // 40% at evens is a losing bet
    expect(kellyFraction(0.4, 2.0)).toBe(0);
  });

  it('returns 0 for degenerate inputs', () => {
    expect(kellyFraction(0, 2.0)).toBe(0);
    expect(kellyFraction(1, 2.0)).toBe(0);
    expect(kellyFraction(0.5, 1.0)).toBe(0);
  });
});

describe('kellyStake', () => {
  it('stakes the Kelly fraction of the bankroll', () => {
    // kellyFraction(0.52, 2.0) = 0.04 → 4% of 10k = 400
    expect(kellyStake(0.52, 2.0, 10_000)).toBeCloseTo(400);
  });

  it('caps the stake at the maximum fraction', () => {
    // raw Kelly here is 0.2, cap at 10% of 10k = 1000
    expect(kellyStake(0.6, 2.0, 10_000)).toBe(1000);
  });

  it('rounds to cents', () => {
    const stake = kellyStake(0.53, 2.1, 3333.33);
    expect(stake).toBe(Math.round(stake * 100) / 100);
  });
});
