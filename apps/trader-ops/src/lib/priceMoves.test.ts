import { describe, expect, it } from 'vitest';
import type { Market } from '@arena/contracts';
import { diffPrices, moveKey, overround } from './priceMoves';

/** Build a valid Market with the given selection prices. */
function market(id: string, selections: Array<{ id: string; price: number }>): Market {
  return {
    id,
    type: 'MATCH_WINNER',
    fixtureId: 'fx',
    name: `Market ${id}`,
    status: 'open',
    selections: selections.map((s) => ({ id: s.id, name: `Sel ${s.id}`, price: s.price })),
  };
}

describe('moveKey', () => {
  it('joins market and selection ids with a colon', () => {
    expect(moveKey('m1', 's1')).toBe('m1:s1');
  });
});

describe('diffPrices', () => {
  it('returns no moves when there is no previous snapshot', () => {
    const next = [
      market('m1', [
        { id: 's1', price: 2 },
        { id: 's2', price: 2 },
      ]),
    ];
    expect(diffPrices(null, next)).toEqual({});
  });

  it("marks a selection 'up' when its price rose", () => {
    const prev = [
      market('m1', [
        { id: 's1', price: 2.0 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    const next = [
      market('m1', [
        { id: 's1', price: 2.4 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    expect(diffPrices(prev, next)).toEqual({ 'm1:s1': 'up' });
  });

  it("marks a selection 'down' when its price fell", () => {
    const prev = [
      market('m1', [
        { id: 's1', price: 3.4 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    const next = [
      market('m1', [
        { id: 's1', price: 3.1 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    expect(diffPrices(prev, next)).toEqual({ 'm1:s1': 'down' });
  });

  it('omits selections whose price is unchanged', () => {
    const snap = [
      market('m1', [
        { id: 's1', price: 2.0 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    expect(diffPrices(snap, snap)).toEqual({});
  });

  it('omits selections that only appear in the new snapshot', () => {
    const prev = [
      market('m1', [
        { id: 's1', price: 2.0 },
        { id: 's2', price: 2.0 },
      ]),
    ];
    const next = [
      market('m1', [
        { id: 's1', price: 2.0 },
        { id: 's2', price: 2.0 },
        { id: 's3', price: 2.0 },
      ]),
    ];
    expect(diffPrices(prev, next)).toEqual({});
  });

  it('tracks moves across multiple markets independently', () => {
    const prev = [
      market('m1', [
        { id: 's1', price: 2.0 },
        { id: 's2', price: 2.0 },
      ]),
      market('m2', [
        { id: 's3', price: 5.0 },
        { id: 's4', price: 1.5 },
      ]),
    ];
    const next = [
      market('m1', [
        { id: 's1', price: 2.5 },
        { id: 's2', price: 2.0 },
      ]),
      market('m2', [
        { id: 's3', price: 4.5 },
        { id: 's4', price: 1.5 },
      ]),
    ];
    expect(diffPrices(prev, next)).toEqual({ 'm1:s1': 'up', 'm2:s3': 'down' });
  });
});

describe('overround', () => {
  it('sums the implied probabilities (1/price) across selections — a fair book is 1.0', () => {
    const fair = market('m1', [
      { id: 's1', price: 2.0 },
      { id: 's2', price: 2.0 },
    ]);
    expect(overround(fair)).toBeCloseTo(1.0, 10);
  });

  it('exceeds 1.0 by the book margin when prices carry overround', () => {
    // Two even outcomes priced at 1.90 → 2 * (1/1.90) ≈ 1.0526 (a ~5% margin).
    const priced = market('m1', [
      { id: 's1', price: 1.9 },
      { id: 's2', price: 1.9 },
    ]);
    expect(overround(priced)).toBeCloseTo(1.0526, 3);
  });
});
