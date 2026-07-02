import {
  FIXTURES,
  MarketSchema,
  TARGET_OVERROUND,
  TEAMS,
  teamById,
  type Fixture,
  type Market,
} from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { priceableFixtures } from './bracket';
import {
  OUTRIGHT_MARKET_ID,
  buildMatchWinnerMarket,
  buildOutrightMarket,
  buildSettledOutrightMarket,
  sortMarkets,
} from './market-builder';

const R16_2 = 'R16-2';
const FRANCE = 'France';
const PARAGUAY = 'Paraguay';

function r16_2(): Fixture {
  const fixture = FIXTURES.find((candidate) => candidate.id === R16_2);
  if (!fixture) throw new Error('seed bracket must contain R16-2');
  return fixture;
}

describe('buildMatchWinnerMarket', () => {
  it('builds the demo market: France heavy favourites over Paraguay at a 1.05 book', () => {
    const market = buildMatchWinnerMarket(r16_2(), TEAMS);
    expect(MarketSchema.parse(market)).toBeTruthy();
    expect(market.name).toBe(`${PARAGUAY} v ${FRANCE}`);
    const [paraguay, france] = [
      market.selections.find((s) => s.name === PARAGUAY),
      market.selections.find((s) => s.name === FRANCE),
    ];
    expect(france?.price).toBeLessThan(paraguay?.price ?? 0);
    expect(france?.probability).toBeCloseTo(0.8823, 3);
    const impliedSum = market.selections.reduce((sum, s) => sum + 1 / s.price, 0);
    expect(impliedSum).toBeCloseTo(TARGET_OVERROUND, 2);
  });

  it('upholds the §3 join for every priceable seed fixture: id == fixtureId, names == Team.name', () => {
    for (const fixture of priceableFixtures(FIXTURES)) {
      const market = buildMatchWinnerMarket(fixture, TEAMS);
      expect(market.id).toBe(fixture.id);
      expect(market.fixtureId).toBe(fixture.id);
      expect(market.type).toBe('MATCH_WINNER');
      expect(market.selections).toHaveLength(2);
      for (const selection of market.selections) {
        const teamId = selection.id.split(':')[1];
        expect(selection.name).toBe(teamById(teamId)?.name);
      }
      expect(MarketSchema.parse(market)).toBeTruthy();
    }
  });

  it('gives selections deterministic ids for clean upserts', () => {
    const market = buildMatchWinnerMarket(r16_2(), TEAMS);
    expect(market.selections.map((s) => s.id)).toEqual(['R16-2:PAR', 'R16-2:FRA']);
  });

  it('marks the market settled once its fixture is finished', () => {
    const finished = { ...r16_2(), status: 'finished' as const, winnerTeamId: 'FRA' };
    const market = buildMatchWinnerMarket(finished, TEAMS);
    expect(market.status).toBe('settled');
    // Names survive settlement — the simulator resolves winners by name.
    expect(market.selections.map((s) => s.name).sort()).toEqual([FRANCE, PARAGUAY]);
  });

  it('refuses a fixture with undecided teams', () => {
    const undecided = FIXTURES.find((fixture) => fixture.homeTeamId === null);
    expect(undecided).toBeDefined();
    expect(() => buildMatchWinnerMarket(undecided as Fixture, TEAMS)).toThrow(/not priceable/);
  });

  it('refuses a team missing from the ratings table', () => {
    expect(() => buildMatchWinnerMarket({ ...r16_2(), homeTeamId: 'ZZZ' }, TEAMS)).toThrow(
      /Unknown team/
    );
  });
});

describe('buildOutrightMarket', () => {
  const probabilities = new Map([
    ['ESP', 0.3],
    ['FRA', 0.25],
    ['ARG', 0.45],
  ]);

  it('prices one selection per alive team, favourite first', () => {
    const market = buildOutrightMarket(probabilities, ['ESP', 'FRA', 'ARG'], TEAMS);
    expect(MarketSchema.parse(market)).toBeTruthy();
    expect(market.id).toBe(OUTRIGHT_MARKET_ID);
    expect(market.fixtureId).toBeNull();
    expect(market.type).toBe('OUTRIGHT');
    expect(market.status).toBe('open');
    expect(market.selections.map((s) => s.name)).toEqual(['Argentina', 'Spain', FRANCE]);
    expect(market.selections.map((s) => s.id)).toEqual([
      'outright:ARG',
      'outright:ESP',
      'outright:FRA',
    ]);
  });

  it('caps a team the simulation never crowned instead of quoting infinity', () => {
    const market = buildOutrightMarket(probabilities, ['ESP', 'CPV'], TEAMS);
    const caboVerde = market.selections.find((s) => s.name === 'Cabo Verde');
    expect(caboVerde?.probability).toBe(0);
    expect(caboVerde?.price).toBe(1000);
  });
});

describe('buildSettledOutrightMarket', () => {
  const settledFinal: Fixture = {
    id: 'F-1',
    round: 'F',
    kickoff: '2026-07-19T19:00:00.000Z',
    homeTeamId: 'FRA',
    awayTeamId: 'ESP',
    feedsInto: null,
    feedsIntoSlot: null,
    status: 'finished',
    homeScore: 1,
    awayScore: 2,
    winnerTeamId: 'ESP',
  };

  it('keeps both finalists and reflects the champion at probability 1', () => {
    const market = buildSettledOutrightMarket(settledFinal, TEAMS);
    expect(MarketSchema.parse(market)).toBeTruthy();
    expect(market.status).toBe('settled');
    expect(market.selections).toHaveLength(2);
    const champion = market.selections.find((s) => s.name === 'Spain');
    const runnerUp = market.selections.find((s) => s.name === FRANCE);
    expect(champion?.probability).toBe(1);
    expect(champion?.price).toBe(1.01);
    expect(runnerUp?.probability).toBe(0);
  });

  it('refuses an unsettled final', () => {
    expect(() =>
      buildSettledOutrightMarket({ ...settledFinal, winnerTeamId: null }, TEAMS)
    ).toThrow(/not settled/);
  });
});

describe('sortMarkets', () => {
  function stub(id: string, fixtureId: string | null): Market {
    return {
      id,
      type: fixtureId ? 'MATCH_WINNER' : 'OUTRIGHT',
      fixtureId,
      name: id,
      status: 'open',
      selections: [
        { id: `${id}:a`, name: 'a', price: 1.5 },
        { id: `${id}:b`, name: 'b', price: 2.5 },
      ],
    };
  }

  it('lists markets in bracket order with the outright last', () => {
    const shuffled = [
      stub(OUTRIGHT_MARKET_ID, null),
      stub('F-1', 'F-1'),
      stub(R16_2, R16_2),
      stub('R32-9', 'R32-9'),
    ];
    expect(sortMarkets(shuffled, FIXTURES).map((market) => market.id)).toEqual([
      'R32-9',
      R16_2,
      'F-1',
      OUTRIGHT_MARKET_ID,
    ]);
  });

  it('ranks markets for unknown fixtures after known ones, before the outright', () => {
    const markets = [
      stub(OUTRIGHT_MARKET_ID, null),
      stub('Z-9', 'Z-9'),
      stub('A-9', 'A-9'),
      stub(R16_2, R16_2),
    ];
    expect(sortMarkets(markets, FIXTURES).map((market) => market.id)).toEqual([
      R16_2,
      'A-9',
      'Z-9',
      OUTRIGHT_MARKET_ID,
    ]);
  });
});
