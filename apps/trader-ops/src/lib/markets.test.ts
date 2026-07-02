import { describe, expect, it } from 'vitest';
import { TARGET_OVERROUND, type Market } from '@arena/contracts';
import { diffPrices, overround, overroundDriftPct } from './markets';

type Sel = { id: string; price: number };

function market(selections: readonly Sel[]): Market {
  return {
    id: 'F-SF-1',
    type: 'MATCH_WINNER',
    fixtureId: 'F-SF-1',
    name: 'Semi-final',
    status: 'open',
    selections: selections.map((s) => ({ id: s.id, name: s.id.toUpperCase(), price: s.price })),
  };
}

describe('diffPrices', () => {
  it('diffPrices flags only selections whose price moved', () => {
    const prev = [
      market([
        { id: 'a', price: 2.0 },
        { id: 'b', price: 3.0 },
        { id: 'c', price: 4.0 },
      ]),
    ];
    const next = [
      market([
        { id: 'a', price: 2.5 }, // drifted out — up
        { id: 'b', price: 2.4 }, // shortened — down
        { id: 'c', price: 4.0 }, // unchanged — no entry
        { id: 'd', price: 5.0 }, // brand-new — no entry
      ]),
    ];

    expect(diffPrices(prev, next)).toEqual({ a: 'up', b: 'down' });
    // No previous poll to compare against yet.
    expect(diffPrices(null, next)).toEqual({});
  });
});

describe('overround', () => {
  it('overround exposes the margin and its drift against TARGET_OVERROUND', () => {
    // A fair evens book: 1/2 + 1/2 = 1.000 (100%), below the 105% house target.
    const fair = market([
      { id: 'x', price: 2 },
      { id: 'y', price: 2 },
    ]);
    expect(overround(fair)).toBeCloseTo(1.0, 10);
    expect(overroundDriftPct(fair)).toBeCloseTo(
      ((1.0 - TARGET_OVERROUND) / TARGET_OVERROUND) * 100,
      6
    );

    // Priced exactly on target: 1/2 + 0.55 = 1.05 => zero drift.
    const onTarget = market([
      { id: 'x', price: 2 },
      { id: 'y', price: 1 / 0.55 },
    ]);
    expect(overround(onTarget)).toBeCloseTo(TARGET_OVERROUND, 10);
    expect(overroundDriftPct(onTarget)).toBeCloseTo(0, 6);
  });
});
