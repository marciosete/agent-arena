import { MarketSchema, TARGET_OVERROUND } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildMatchWinnerMarket,
  buildOutrightMarket,
  OUTRIGHT_MARKET_ID,
  OUTRIGHT_MARKET_NAME,
  selectionId,
  sortMarkets,
  toContractMarket,
} from './market-builder';
import { requireTeam } from './teams';

const R16_2 = 'R16-2';
const FRANCE = 'France';
const PARAGUAY = 'Paraguay';

function demoMarket() {
  return buildMatchWinnerMarket(R16_2, requireTeam('PAR'), requireTeam('FRA'));
}

describe('buildMatchWinnerMarket', () => {
  it('sets id == fixtureId and names selections by exact Team.name (§3 join)', () => {
    const market = demoMarket();
    expect(market.id).toBe(R16_2);
    expect(market.fixtureId).toBe(R16_2);
    expect(market.type).toBe('MATCH_WINNER');
    expect(market.status).toBe('open');
    expect(market.name).toBe('Paraguay v France');
    expect(market.selections.map((selection) => selection.name)).toEqual([PARAGUAY, FRANCE]);
    expect(market.selections.map((selection) => selection.id)).toEqual([
      `${R16_2}:PAR`,
      `${R16_2}:FRA`,
    ]);
  });

  it('prices France as heavy favourites with a 1.05 book (the demo moment)', () => {
    const market = demoMarket();
    const france = market.selections.find((selection) => selection.name === FRANCE);
    const paraguay = market.selections.find((selection) => selection.name === PARAGUAY);
    expect(france?.price).toBe(1.08);
    expect(paraguay?.price).toBe(8.09);
    const overround = market.selections.reduce((sum, selection) => sum + 1 / selection.price, 0);
    expect(overround).toBeCloseTo(TARGET_OVERROUND, 2);
    expect((france?.probability ?? 0) + (paraguay?.probability ?? 0)).toBeCloseTo(1, 12);
  });
});

describe('buildOutrightMarket', () => {
  const alive = [requireTeam('FRA'), requireTeam('ESP'), requireTeam('CPV')];
  const probabilities = new Map([
    ['FRA', 0.3],
    ['ESP', 0.4],
  ]);

  it("uses the fixed 'outright' id with a null fixtureId (§3)", () => {
    const market = buildOutrightMarket(probabilities, alive);
    expect(market.id).toBe(OUTRIGHT_MARKET_ID);
    expect(market.fixtureId).toBeNull();
    expect(market.type).toBe('OUTRIGHT');
    expect(market.name).toBe(OUTRIGHT_MARKET_NAME);
  });

  it('creates one selection per alive team, defaulting missing probabilities to 0', () => {
    const market = buildOutrightMarket(probabilities, alive);
    expect(market.selections).toHaveLength(3);
    const caboVerde = market.selections.find((selection) => selection.teamId === 'CPV');
    expect(caboVerde?.probability).toBe(0);
    expect(caboVerde?.price).toBe(1000);
    expect(caboVerde?.name).toBe('Cabo Verde');
  });
});

describe('toContractMarket', () => {
  it('produces a MarketSchema-valid payload with favourites first and no teamId', () => {
    const market = toContractMarket(demoMarket());
    const parsed = MarketSchema.parse(market);
    expect(parsed.selections.map((selection) => selection.name)).toEqual([FRANCE, PARAGUAY]);
    expect(Object.keys(parsed.selections[0] ?? {})).not.toContain('teamId');
  });
});

describe('sortMarkets', () => {
  it('orders match markets by bracket order with the outright last', () => {
    const outright = buildOutrightMarket(new Map(), [requireTeam('FRA'), requireTeam('ESP')]);
    const r16 = demoMarket();
    const r32 = buildMatchWinnerMarket('R32-9', requireTeam('POR'), requireTeam('CRO'));
    const sorted = sortMarkets([outright, r16, r32]);
    expect(sorted.map((market) => market.id)).toEqual(['R32-9', R16_2, OUTRIGHT_MARKET_ID]);
  });
});

describe('selectionId', () => {
  it('is the deterministic marketId:teamId pair', () => {
    expect(selectionId(OUTRIGHT_MARKET_ID, 'FRA')).toBe('outright:FRA');
  });
});
