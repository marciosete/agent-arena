import { describe, expect, it } from 'vitest';
import type { ExposureReport } from '@arena/contracts';
import {
  DEFAULT_HEAT_THRESHOLDS,
  heatLevel,
  sortByLiability,
  summarise,
  type ExposureMarket,
} from './exposure';

function market(over: Partial<ExposureMarket> = {}): ExposureMarket {
  return {
    marketId: over.marketId ?? 'm1',
    marketName: over.marketName ?? 'Match Winner',
    totalStaked: over.totalStaked ?? 100,
    maxLiability: over.maxLiability ?? 100,
    betCount: over.betCount ?? 1,
    status: over.status ?? 'open',
  };
}

function report(markets: ExposureMarket[]): ExposureReport {
  return { generatedAt: '2026-07-03T12:00:00.000Z', markets };
}

describe('heatLevel', () => {
  const { mid, high } = DEFAULT_HEAT_THRESHOLDS;

  it('is low just below the mid threshold', () => {
    expect(heatLevel(mid - 1, DEFAULT_HEAT_THRESHOLDS)).toBe('low');
  });

  it('is mid exactly at the mid threshold', () => {
    expect(heatLevel(mid, DEFAULT_HEAT_THRESHOLDS)).toBe('mid');
  });

  it('stays mid just below the high threshold', () => {
    expect(heatLevel(high - 1, DEFAULT_HEAT_THRESHOLDS)).toBe('mid');
  });

  it('is high exactly at the high threshold', () => {
    expect(heatLevel(high, DEFAULT_HEAT_THRESHOLDS)).toBe('high');
  });

  it('honours custom thresholds', () => {
    expect(heatLevel(50, { mid: 40, high: 90 })).toBe('mid');
    expect(heatLevel(90, { mid: 40, high: 90 })).toBe('high');
  });
});

describe('sortByLiability', () => {
  it('orders markets by worst-case liability, biggest first', () => {
    const sorted = sortByLiability([
      market({ marketId: 'a', maxLiability: 1_000 }),
      market({ marketId: 'b', maxLiability: 25_000 }),
      market({ marketId: 'c', maxLiability: 8_000 }),
    ]);
    expect(sorted.map((m) => m.marketId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by market name for a stable order', () => {
    const sorted = sortByLiability([
      market({ marketId: 'z', marketName: 'Zulu', maxLiability: 5_000 }),
      market({ marketId: 'a', marketName: 'Alpha', maxLiability: 5_000 }),
    ]);
    expect(sorted.map((m) => m.marketName)).toEqual(['Alpha', 'Zulu']);
  });

  it('does not mutate the input array', () => {
    const input = [
      market({ marketId: 'a', maxLiability: 1 }),
      market({ marketId: 'b', maxLiability: 2 }),
    ];
    const snapshot = input.map((m) => m.marketId);
    sortByLiability(input);
    expect(input.map((m) => m.marketId)).toEqual(snapshot);
  });
});

describe('summarise', () => {
  it('totals staked and liability and counts only open markets', () => {
    const summary = summarise(
      report([
        market({ totalStaked: 100, maxLiability: 1_000, status: 'open' }),
        market({ totalStaked: 250, maxLiability: 4_000, status: 'suspended' }),
        market({ totalStaked: 150, maxLiability: 2_000, status: 'settled' }),
        market({ totalStaked: 500, maxLiability: 9_000, status: 'open' }),
      ])
    );
    expect(summary.totalStaked).toBe(1_000);
    expect(summary.totalLiability).toBe(16_000);
    expect(summary.openCount).toBe(2);
  });

  it('returns zeroed totals for an empty book', () => {
    expect(summarise(report([]))).toEqual({
      totalStaked: 0,
      totalLiability: 0,
      openCount: 0,
    });
  });
});
