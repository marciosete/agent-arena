import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEAT_THRESHOLDS,
  exposureTotals,
  heatLevel,
  sortByLiability,
  type HeatThresholds,
} from './exposure';

describe('heatLevel', () => {
  it('heatLevel colours liabilities against the configurable thresholds', () => {
    // Defaults: amber at 2,500, red at 10,000 — boundaries land on the hotter band.
    expect(heatLevel(0)).toBe('low');
    expect(heatLevel(2_499)).toBe('low');
    expect(heatLevel(2_500)).toBe('amber');
    expect(heatLevel(9_999)).toBe('amber');
    expect(heatLevel(10_000)).toBe('red');
    expect(heatLevel(50_000)).toBe('red');
    expect(DEFAULT_HEAT_THRESHOLDS).toEqual({ amber: 2_500, red: 10_000 });

    // A custom thresholds object re-tunes the bands without touching the maths.
    const tight: HeatThresholds = { amber: 100, red: 200 };
    expect(heatLevel(99, tight)).toBe('low');
    expect(heatLevel(100, tight)).toBe('amber');
    expect(heatLevel(200, tight)).toBe('red');
  });
});

describe('sortByLiability', () => {
  it('sortByLiability orders markets by worst-case liability with stable tie-breaks', () => {
    const input = [
      { marketId: 'm-low', maxLiability: 100, totalStaked: 5 },
      { marketId: 'm-b', maxLiability: 500, totalStaked: 200 },
      { marketId: 'm-a', maxLiability: 500, totalStaked: 200 },
      { marketId: 'm-mid', maxLiability: 500, totalStaked: 900 },
      { marketId: 'm-top', maxLiability: 9_000, totalStaked: 1 },
    ];
    const snapshot = structuredClone(input);

    const sorted = sortByLiability(input);

    // liability desc, then staked desc, then marketId asc on the full tie.
    expect(sorted.map((m) => m.marketId)).toEqual(['m-top', 'm-mid', 'm-a', 'm-b', 'm-low']);
    // The input array is returned untouched — a fresh array comes back.
    expect(sorted).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});

describe('exposureTotals', () => {
  it('exposureTotals sums staked, liability and open market count', () => {
    const markets = [
      { totalStaked: 100, maxLiability: 400, status: 'open' },
      { totalStaked: 250, maxLiability: 1_000, status: 'open' },
      { totalStaked: 50, maxLiability: 75, status: 'suspended' },
      { totalStaked: 30, maxLiability: 0, status: 'settled' },
    ];

    expect(exposureTotals(markets)).toEqual({
      totalStaked: 430,
      maxLiability: 1_475,
      openCount: 2,
    });
    expect(exposureTotals([])).toEqual({ totalStaked: 0, maxLiability: 0, openCount: 0 });
  });
});
