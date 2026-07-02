import { describe, expect, it } from 'vitest';
import type { Market } from '@arena/contracts';
import {
  PRICE_TOLERANCE,
  computePotentialReturn,
  findSelection,
  isPriceWithinTolerance,
  resolveMarketPath,
} from './domain';

const MARKET: Market = {
  id: 'r16-1',
  type: 'MATCH_WINNER',
  fixtureId: 'r16-1',
  name: 'Brazil v Chile — Match Winner',
  status: 'open',
  selections: [
    { id: 'sel-bra', name: 'Brazil', price: 1.55 },
    { id: 'sel-chi', name: 'Chile', price: 2.4 },
  ],
};

describe('PRICE_TOLERANCE', () => {
  it('is 5%, betting-local (not a contract export)', () => {
    expect(PRICE_TOLERANCE).toBe(0.05);
  });
});

describe('isPriceWithinTolerance', () => {
  it('accepts the exact accepted price', () => {
    expect(isPriceWithinTolerance(2.0, 2.0)).toBe(true);
  });

  it('accepts a live price exactly on the +5% boundary', () => {
    expect(isPriceWithinTolerance(2.1, 2.0)).toBe(true);
  });

  it('accepts a live price exactly on the -5% boundary', () => {
    expect(isPriceWithinTolerance(1.9, 2.0)).toBe(true);
  });

  it('rejects a live price just above the +5% boundary', () => {
    expect(isPriceWithinTolerance(2.11, 2.0)).toBe(false);
  });

  it('rejects a live price just below the -5% boundary', () => {
    expect(isPriceWithinTolerance(1.89, 2.0)).toBe(false);
  });

  it('measures the tolerance band relative to the ACCEPTED price', () => {
    // 5% of accepted (10.0) is 0.5 — a live price of 10.5 is in, 10.51 is out.
    expect(isPriceWithinTolerance(10.5, 10.0)).toBe(true);
    expect(isPriceWithinTolerance(10.51, 10.0)).toBe(false);
  });

  it('rejects non-finite prices (NaN / Infinity never validate)', () => {
    expect(isPriceWithinTolerance(Number.NaN, 2.0)).toBe(false);
    expect(isPriceWithinTolerance(Number.POSITIVE_INFINITY, 2.0)).toBe(false);
    expect(isPriceWithinTolerance(2.0, Number.NaN)).toBe(false);
  });

  it('supports an explicit tolerance override', () => {
    expect(isPriceWithinTolerance(3.0, 2.0, 0.5)).toBe(true);
    expect(isPriceWithinTolerance(3.01, 2.0, 0.5)).toBe(false);
  });
});

describe('computePotentialReturn', () => {
  it('is stake × decimal price (the stake rides — it is included in the return)', () => {
    expect(computePotentialReturn(100, 2.5)).toBe(250);
  });

  it('rounds to cents', () => {
    expect(computePotentialReturn(33.33, 3)).toBe(99.99);
    expect(computePotentialReturn(10.1, 3.03)).toBe(30.6);
  });

  it('never produces float-noise tails', () => {
    // 0.1 × 1.1 = 0.11000000000000001 in raw IEEE-754.
    expect(computePotentialReturn(0.1, 1.1)).toBe(0.11);
  });
});

describe('resolveMarketPath', () => {
  it("maps the fixed outright market id to '/outright'", () => {
    expect(resolveMarketPath('outright')).toBe('/outright');
  });

  it('maps a MATCH_WINNER market id (== fixtureId) to /markets/:fixtureId', () => {
    expect(resolveMarketPath('r16-1')).toBe('/markets/r16-1');
  });

  it('URI-encodes ids so they cannot smuggle path segments', () => {
    expect(resolveMarketPath('a/b c')).toBe('/markets/a%2Fb%20c');
  });
});

describe('findSelection', () => {
  it('finds a selection by id', () => {
    expect(findSelection(MARKET, 'sel-chi')?.name).toBe('Chile');
  });

  it('returns undefined for an unknown selection id', () => {
    expect(findSelection(MARKET, 'sel-nope')).toBeUndefined();
  });
});
