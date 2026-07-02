import { describe, expect, it } from 'vitest';
import { affordableStake } from '../strategies/shared';

describe('affordableStake', () => {
  it('rounds the desired stake to whole cents', () => {
    expect(affordableStake(454.5454545454545, 10_000)).toBe(454.55);
  });

  it('floors a float-dust wallet so the stake never exceeds the balance', () => {
    // IEEE-754 debits leave balances like this; rounding up would 400 at betting.
    const dusty = 204.99999999999997;
    expect(affordableStake(10_000, dusty)).toBeLessThanOrEqual(dusty);
    expect(affordableStake(10_000, dusty)).toBe(204.99);
  });

  it('clamps to the contract maximum stake', () => {
    expect(affordableStake(50_000, 60_000)).toBe(10_000);
  });

  it('returns 0 below the minimum stake', () => {
    expect(affordableStake(0.4, 10_000)).toBe(0);
    expect(affordableStake(100, 0.5)).toBe(0);
  });
});
