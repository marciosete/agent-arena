import { describe, expect, it } from 'vitest';
import { TEAMS, type Fixture } from '@arena/contracts';
import { deriveSettlements, mergeObservedOrder, type SettlementRow } from './settlements';

const HOME = TEAMS[0];
const AWAY = TEAMS[1];

function fixture(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    round: 'QF',
    kickoff: '2026-07-01T12:00:00.000Z',
    homeTeamId: HOME.id,
    awayTeamId: AWAY.id,
    feedsInto: 'F-SF-1',
    feedsIntoSlot: 'home',
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: HOME.id,
    ...overrides,
  };
}

function row(id: string): SettlementRow {
  return {
    fixtureId: id,
    round: 'QF',
    homeName: 'H',
    awayName: 'A',
    homeScore: 1,
    awayScore: 0,
    winnerName: 'H',
    decidedOnPenalties: false,
    marketId: id,
    kickoff: '2026-07-01T12:00:00.000Z',
  };
}

describe('deriveSettlements', () => {
  it('deriveSettlements keeps only fully-finished fixtures newest first and joins the settled market by fixtureId', () => {
    const rows = deriveSettlements([
      fixture({ id: 'early', kickoff: '2026-07-01T12:00:00.000Z' }),
      fixture({ id: 'late', kickoff: '2026-07-05T20:00:00.000Z' }),
      fixture({
        id: 'scheduled',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
      fixture({ id: 'in-play', status: 'in_play', winnerTeamId: null }),
      fixture({ id: 'no-winner', winnerTeamId: null }),
      fixture({ id: 'no-score', homeScore: null, awayScore: null }),
    ]);

    // Only the two finished-with-a-winner fixtures survive, newest kickoff first.
    expect(rows.map((r) => r.fixtureId)).toEqual(['late', 'early']);
    const [newest] = rows;
    expect(newest.marketId).toBe('late'); // market id === fixture id (§3)
    expect(newest.round).toBe('QF');
    expect(newest.homeName).toBe(HOME.name);
    expect(newest.awayName).toBe(AWAY.name);
    expect(newest.winnerName).toBe(HOME.name);
    expect(newest.decidedOnPenalties).toBe(false);
  });

  it('falls back to the raw id or TBD when a team slot is unresolved', () => {
    const [only] = deriveSettlements([
      fixture({ id: 'mystery', homeTeamId: 'ZZZ', awayTeamId: null, winnerTeamId: 'ZZZ' }),
    ]);
    expect(only.homeName).toBe('ZZZ'); // unknown id shows raw
    expect(only.awayName).toBe('TBD'); // null slot shows TBD
    expect(only.winnerName).toBe('ZZZ');
  });

  it('deriveSettlements derives penalties from a level score with a winner', () => {
    const [shootout] = deriveSettlements([
      fixture({ id: 'shootout', homeScore: 1, awayScore: 1, winnerTeamId: AWAY.id }),
    ]);
    expect(shootout.decidedOnPenalties).toBe(true);
    expect(shootout.winnerName).toBe(AWAY.name);

    const [decisive] = deriveSettlements([
      fixture({ id: 'decisive', homeScore: 3, awayScore: 0, winnerTeamId: HOME.id }),
    ]);
    expect(decisive.decidedOnPenalties).toBe(false);
  });
});

describe('mergeObservedOrder', () => {
  it('mergeObservedOrder puts newly-observed results on top and prunes vanished ones', () => {
    const first = mergeObservedOrder([], [row('a'), row('b')]);
    expect(first).toEqual(['a', 'b']);

    // 'c' is newly observed => on top; survivors keep their prior order.
    const second = mergeObservedOrder(first, [row('c'), row('a'), row('b')]);
    expect(second).toEqual(['c', 'a', 'b']);

    // 'a' vanished from the rows => pruned; new 'd' lands on top.
    const third = mergeObservedOrder(second, [row('d'), row('c'), row('b')]);
    expect(third).toEqual(['d', 'c', 'b']);
  });
});
