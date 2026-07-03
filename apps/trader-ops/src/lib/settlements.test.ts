import { describe, expect, it } from 'vitest';
import type { Fixture } from '@arena/contracts';
import { deriveSettlements } from './settlements';

/** A finished POR–CRO fixture by default; override any field per test. */
function fixture(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    round: 'R32',
    kickoff: '2026-07-02T17:00:00Z',
    homeTeamId: 'POR',
    awayTeamId: 'CRO',
    feedsInto: null,
    feedsIntoSlot: null,
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: 'POR',
    ...overrides,
  };
}

describe('deriveSettlements penalties derivation', () => {
  it('treats a decisive score as won in normal play (not penalties)', () => {
    const [settled] = deriveSettlements([fixture({ id: 'R32-9', homeScore: 2, awayScore: 1 })]);
    expect(settled.decidedOnPenalties).toBe(false);
    expect(settled.homeName).toBe('Portugal');
    expect(settled.awayName).toBe('Croatia');
    expect(settled.winnerName).toBe('Portugal');
  });

  it('treats a level score with a winner as decided on penalties', () => {
    const [settled] = deriveSettlements([
      fixture({ id: 'R32-9', homeScore: 1, awayScore: 1, winnerTeamId: 'CRO' }),
    ]);
    expect(settled.decidedOnPenalties).toBe(true);
    expect(settled.winnerName).toBe('Croatia');
  });
});

describe('deriveSettlements exclusion', () => {
  it('excludes scheduled, in-play, and incomplete fixtures', () => {
    const settled = deriveSettlements([
      fixture({
        id: 'scheduled',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
      fixture({ id: 'in-play', status: 'in_play' }),
      fixture({ id: 'no-winner', status: 'finished', winnerTeamId: null }),
      fixture({ id: 'no-home-score', status: 'finished', homeScore: null }),
      fixture({ id: 'no-away-score', status: 'finished', awayScore: null }),
      fixture({ id: 'complete', status: 'finished' }),
    ]);
    expect(settled.map((s) => s.fixtureId)).toEqual(['complete']);
  });
});

describe('deriveSettlements ordering', () => {
  it('orders newest first by kickoff', () => {
    const settled = deriveSettlements([
      fixture({ id: 'early', kickoff: '2026-07-02T17:00:00Z' }),
      fixture({ id: 'late', kickoff: '2026-07-04T21:00:00Z' }),
      fixture({ id: 'mid', kickoff: '2026-07-03T20:00:00Z' }),
    ]);
    expect(settled.map((s) => s.fixtureId)).toEqual(['late', 'mid', 'early']);
  });

  it('breaks kickoff ties by fixtureId regardless of input order', () => {
    const settled = deriveSettlements([
      fixture({ id: 'B', kickoff: '2026-07-03T20:00:00Z' }),
      fixture({ id: 'A', kickoff: '2026-07-03T20:00:00Z' }),
    ]);
    expect(settled.map((s) => s.fixtureId)).toEqual(['A', 'B']);
  });
});

describe('deriveSettlements joins', () => {
  it('sets marketId equal to the fixtureId (the MATCH_WINNER market join)', () => {
    const [settled] = deriveSettlements([fixture({ id: 'R16-4' })]);
    expect(settled.marketId).toBe('R16-4');
    expect(settled.marketId).toBe(settled.fixtureId);
  });

  it('falls back to the raw id for unknown teams and "?" for empty slots', () => {
    const [settled] = deriveSettlements([
      fixture({
        id: 'x',
        homeTeamId: null,
        awayTeamId: 'ZZZ',
        winnerTeamId: 'ZZZ',
        homeScore: 0,
        awayScore: 3,
      }),
    ]);
    expect(settled.homeName).toBe('?');
    expect(settled.awayName).toBe('ZZZ');
    expect(settled.winnerName).toBe('ZZZ');
  });

  it('does not mutate the input array order', () => {
    const input = [
      fixture({ id: 'early', kickoff: '2026-07-02T17:00:00Z' }),
      fixture({ id: 'late', kickoff: '2026-07-04T21:00:00Z' }),
    ];
    deriveSettlements(input);
    expect(input.map((f) => f.id)).toEqual(['early', 'late']);
  });
});
