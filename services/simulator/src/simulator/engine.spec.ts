import { describe, expect, it } from 'vitest';
import {
  FIXTURES,
  teamById,
  type Fixture,
  type Market,
  type SettlementEvent,
} from '@arena/contracts';
import {
  applyResult,
  nextUnplayedFixture,
  resolveWinningSelections,
  sampleGoals,
  simulateFixture,
  winProbability,
} from './engine';
import { mulberry32, type Rng } from './rng';

const OPENER = 'R32-9'; // Portugal v Croatia, the earliest unplayed kickoff
const OPENER_FEEDS = 'R16-5';

/** Deterministic rng that replays the given draws in order. */
function stubRng(draws: number[]): Rng {
  let index = 0;
  return () => {
    const value = draws[index];
    index += 1;
    if (value === undefined) {
      throw new Error('stub rng exhausted');
    }
    return value;
  };
}

function freshBracket(): Fixture[] {
  return FIXTURES.map((fixture) => ({ ...fixture }));
}

function fixtureIn(fixtures: Fixture[], id: string): Fixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`no fixture ${id}`);
  }
  return fixture;
}

describe('winProbability', () => {
  it('gives even teams a 50% chance', () => {
    expect(winProbability(1900, 1900)).toBeCloseTo(0.5, 10);
  });

  it('follows the standard Elo logistic curve (+400 elo ⇒ ~90.9%)', () => {
    expect(winProbability(2000, 1600)).toBeCloseTo(0.9091, 3);
  });

  it('is complementary between the two sides', () => {
    expect(winProbability(2100, 1750) + winProbability(1750, 2100)).toBeCloseTo(1, 10);
  });
});

describe('sampleGoals', () => {
  it('maps the uniform draw through the truncated Poisson inverse CDF', () => {
    expect(sampleGoals(stubRng([0.2]))).toBe(0);
    expect(sampleGoals(stubRng([0.5]))).toBe(1);
    expect(sampleGoals(stubRng([0.7]))).toBe(2);
    expect(sampleGoals(stubRng([0.9]))).toBe(3);
    expect(sampleGoals(stubRng([0.99]))).toBe(4);
  });

  it('always stays in the plausible 0–4 range', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 1000; i += 1) {
      const goals = sampleGoals(rng);
      expect(goals).toBeGreaterThanOrEqual(0);
      expect(goals).toBeLessThanOrEqual(4);
    }
  });
});

describe('simulateFixture', () => {
  const opener = () => fixtureIn(freshBracket(), OPENER);

  it('lets the favourite win when the draw lands under its probability', () => {
    // Portugal (2000) v Croatia (1880): P(home) ≈ 0.666, so a 0.5 draw is a home win.
    const result = simulateFixture(opener(), stubRng([0.5, 0.7, 0.2]));
    expect(result.winnerTeamId).toBe('POR');
    expect(result.homeScore).toBe(2);
    expect(result.awayScore).toBe(0);
    expect(result.decidedOnPenalties).toBe(false);
  });

  it('orients the scores to the away side when the away team wins', () => {
    const result = simulateFixture(opener(), stubRng([0.9, 0.2, 0.9]));
    expect(result.winnerTeamId).toBe('CRO');
    expect(result.homeScore).toBe(0);
    expect(result.awayScore).toBe(3);
  });

  it('resolves level scores as a penalty win for the drawn winner', () => {
    const result = simulateFixture(opener(), stubRng([0.5, 0.5, 0.5]));
    expect(result.decidedOnPenalties).toBe(true);
    expect(result.winnerTeamId).toBe('POR');
    expect(result.homeScore).toBe(result.awayScore);
  });

  it("keeps the winner's goals ≥ the loser's across many simulations", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 300; i += 1) {
      const fixture = opener();
      const result = simulateFixture(fixture, rng);
      const winnerScore =
        result.winnerTeamId === fixture.homeTeamId ? result.homeScore : result.awayScore;
      const loserScore =
        result.winnerTeamId === fixture.homeTeamId ? result.awayScore : result.homeScore;
      expect(winnerScore).toBeGreaterThanOrEqual(loserScore);
      if (winnerScore === loserScore) {
        expect(result.decidedOnPenalties).toBe(true);
      }
    }
  });

  it('refuses a team id missing from the TEAMS seed', () => {
    const rogue = { ...opener(), homeTeamId: 'XXX' };
    expect(() => simulateFixture(rogue, mulberry32(1))).toThrow(/unknown team id/);
  });

  it('refuses a fixture with an undetermined slot', () => {
    const tbd = fixtureIn(freshBracket(), OPENER_FEEDS); // both slots still null in the seed
    expect(() => simulateFixture(tbd, mulberry32(1))).toThrow(/undetermined slot/);
  });
});

describe('applyResult / bracket advancement', () => {
  it('advances the winner into the home slot of the fixture it feeds', () => {
    const fixtures = freshBracket();
    const opener = fixtureIn(fixtures, OPENER);
    applyResult(fixtures, opener, {
      winnerTeamId: 'POR',
      homeScore: 2,
      awayScore: 1,
      decidedOnPenalties: false,
    });

    expect(opener.status).toBe('finished');
    expect(opener.homeScore).toBe(2);
    expect(opener.awayScore).toBe(1);
    expect(opener.winnerTeamId).toBe('POR');
    expect(fixtureIn(fixtures, OPENER_FEEDS).homeTeamId).toBe('POR');
    expect(fixtureIn(fixtures, OPENER_FEEDS).awayTeamId).toBeNull();
  });

  it('advances the winner into the away slot of the fixture it feeds', () => {
    const fixtures = freshBracket();
    applyResult(fixtures, fixtureIn(fixtures, 'R32-10'), {
      winnerTeamId: 'ESP',
      homeScore: 1,
      awayScore: 0,
      decidedOnPenalties: false,
    });
    expect(fixtureIn(fixtures, OPENER_FEEDS).awayTeamId).toBe('ESP');
  });

  it('records the final without advancing anywhere', () => {
    const fixtures = freshBracket();
    const final = fixtureIn(fixtures, 'F-1');
    final.homeTeamId = 'FRA';
    final.awayTeamId = 'ARG';
    applyResult(fixtures, final, {
      winnerTeamId: 'ARG',
      homeScore: 1,
      awayScore: 3,
      decidedOnPenalties: false,
    });
    expect(final.status).toBe('finished');
    expect(final.winnerTeamId).toBe('ARG');
  });

  it('throws when a fixture feeds into an unknown fixture id', () => {
    const fixtures = freshBracket();
    const opener = fixtureIn(fixtures, OPENER);
    opener.feedsInto = 'nope';
    expect(() =>
      applyResult(fixtures, opener, {
        winnerTeamId: 'POR',
        homeScore: 1,
        awayScore: 0,
        decidedOnPenalties: false,
      })
    ).toThrow(/unknown fixture/);
  });

  it('puts each winner in the correct slot of the correct next fixture, all the way to the final', () => {
    const fixtures = freshBracket();
    const rng = mulberry32(42);

    let fixture = nextUnplayedFixture(fixtures);
    while (fixture) {
      applyResult(fixtures, fixture, simulateFixture(fixture, rng));
      fixture = nextUnplayedFixture(fixtures);
    }

    expect(fixtures.every((candidate) => candidate.status === 'finished')).toBe(true);
    for (const played of fixtures) {
      expect(played.winnerTeamId).not.toBeNull();
      if (played.feedsInto === null || played.feedsIntoSlot === null) {
        continue;
      }
      const next = fixtureIn(fixtures, played.feedsInto);
      const slotTeam = played.feedsIntoSlot === 'home' ? next.homeTeamId : next.awayTeamId;
      expect(slotTeam).toBe(played.winnerTeamId);
    }
    const final = fixtureIn(fixtures, 'F-1');
    expect([final.homeTeamId, final.awayTeamId]).toContain(final.winnerTeamId);
  });
});

describe('nextUnplayedFixture', () => {
  it('picks the earliest unplayed kickoff even when the array is out of order', () => {
    const fixtures = freshBracket().reverse();
    expect(nextUnplayedFixture(fixtures)?.id).toBe(OPENER);
  });

  it('skips finished fixtures', () => {
    const fixtures = freshBracket();
    fixtureIn(fixtures, OPENER).status = 'finished';
    expect(nextUnplayedFixture(fixtures)?.id).toBe('R32-10');
  });

  it('returns undefined once everything is played', () => {
    const fixtures = freshBracket().map((fixture) => ({ ...fixture, status: 'finished' as const }));
    expect(nextUnplayedFixture(fixtures)).toBeUndefined();
  });
});

describe('resolveWinningSelections (the §3 join)', () => {
  // Real-shaped reprice response: pricing owns selection ids, so they are
  // deliberately opaque here — resolution must go by team name only.
  const repriceResponse = (): Market[] => [
    {
      id: OPENER,
      type: 'MATCH_WINNER',
      fixtureId: OPENER,
      name: 'Portugal v Croatia — Match Winner',
      status: 'settled',
      selections: [
        { id: 'px_9f31c2', name: 'Portugal', price: 1.62, probability: 0.65 },
        { id: 'px_04ab77', name: 'Croatia', price: 3.05, probability: 0.35 },
      ],
    },
    {
      id: 'R32-10',
      type: 'MATCH_WINNER',
      fixtureId: 'R32-10',
      name: 'Spain v Austria — Match Winner',
      status: 'open',
      selections: [
        { id: 'px_5511aa', name: 'Spain', price: 1.3 },
        { id: 'px_c0ffee', name: 'Austria', price: 4.8 },
      ],
    },
    {
      id: 'outright',
      type: 'OUTRIGHT',
      fixtureId: null,
      name: 'Tournament Winner',
      status: 'open',
      selections: [
        { id: 'px_out_01', name: 'Spain', price: 4.5 },
        { id: 'px_out_02', name: 'Portugal', price: 6.0 },
        { id: 'px_out_03', name: 'France', price: 5.0 },
      ],
    },
  ];

  const settlement = (winnerTeamId: string): SettlementEvent => ({
    fixtureId: OPENER,
    winnerTeamId,
    homeScore: 2,
    awayScore: 1,
    decidedOnPenalties: false,
    settledAt: '2026-07-03T12:00:00.000Z',
  });

  it('resolves the winning selectionId BY team name from the repriced markets', () => {
    expect(teamById('POR')?.name).toBe('Portugal');
    expect(
      resolveWinningSelections(repriceResponse(), settlement('POR'), { finalPlayed: false })
    ).toEqual([{ marketId: OPENER, selectionId: 'px_9f31c2' }]);
    expect(
      resolveWinningSelections(repriceResponse(), settlement('CRO'), { finalPlayed: false })
    ).toEqual([{ marketId: OPENER, selectionId: 'px_04ab77' }]);
  });

  it('also settles the OUTRIGHT champion selection when the final is played', () => {
    expect(
      resolveWinningSelections(repriceResponse(), settlement('POR'), { finalPlayed: true })
    ).toEqual([
      { marketId: OPENER, selectionId: 'px_9f31c2' },
      { marketId: 'outright', selectionId: 'px_out_02' },
    ]);
  });

  it('throws when the settled market is missing rather than guessing', () => {
    const markets = repriceResponse().filter((market) => market.id !== OPENER);
    expect(() =>
      resolveWinningSelections(markets, settlement('POR'), { finalPlayed: false })
    ).toThrow(/no MATCH_WINNER market/);
  });

  it('throws when no selection carries the winning team name', () => {
    const markets = repriceResponse();
    markets[0].selections[0].name = 'Prtgl'; // a drifted name must fail loudly, not settle wrongly
    expect(() =>
      resolveWinningSelections(markets, settlement('POR'), { finalPlayed: false })
    ).toThrow(/no selection named 'Portugal'/);
  });

  it('throws when the final is played but the OUTRIGHT market is missing', () => {
    const markets = repriceResponse().filter((market) => market.type !== 'OUTRIGHT');
    expect(() =>
      resolveWinningSelections(markets, settlement('POR'), { finalPlayed: true })
    ).toThrow(/no OUTRIGHT market/);
  });
});
