import { FIXTURES, type Fixture } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { settlementFor as settle } from '../testing/settlement';
import {
  SettlementError,
  aliveTeams,
  applySettlement,
  finalFixture,
  priceableFixtures,
  replaySettlements,
} from './bracket';

const R16_2 = 'R16-2';
const QF_1 = 'QF-1';
const FRA = 'FRA';

function byId(fixtures: Fixture[], id: string): Fixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`missing fixture ${id}`);
  return fixture;
}

describe('applySettlement', () => {
  it('records the result and advances the winner into the away slot it feeds', () => {
    const { fixtures, changed } = applySettlement(FIXTURES, settle(R16_2, FRA));
    const played = byId(fixtures, R16_2);
    expect(changed).toBe(true);
    expect(played.status).toBe('finished');
    expect(played.winnerTeamId).toBe(FRA);
    expect(played.homeScore).toBe(2);
    expect(played.awayScore).toBe(0);
    // R16-2 feeds QF-1's away slot.
    expect(byId(fixtures, QF_1).awayTeamId).toBe(FRA);
    expect(byId(fixtures, QF_1).homeTeamId).toBeNull();
  });

  it('advances a home-slot winner (R16-1 feeds QF-1 home)', () => {
    const { fixtures } = applySettlement(FIXTURES, settle('R16-1', 'MAR'));
    expect(byId(fixtures, QF_1).homeTeamId).toBe('MAR');
  });

  it('does not mutate the input bracket', () => {
    applySettlement(FIXTURES, settle(R16_2, FRA));
    expect(byId(FIXTURES, R16_2).status).toBe('scheduled');
    expect(byId(FIXTURES, QF_1).awayTeamId).toBeNull();
  });

  it('rejects an unknown fixture', () => {
    expect(() => applySettlement(FIXTURES, settle('XX-99', FRA))).toThrow(SettlementError);
  });

  it('rejects a fixture whose teams are not decided yet', () => {
    expect(() => applySettlement(FIXTURES, settle(QF_1, FRA))).toThrow(/both teams/);
  });

  it('rejects a winner who is not playing in the fixture', () => {
    expect(() => applySettlement(FIXTURES, settle(R16_2, 'BRA'))).toThrow(/not playing/);
  });

  it('treats a same-winner retry as an idempotent no-op', () => {
    const first = applySettlement(FIXTURES, settle(R16_2, FRA));
    const retry = applySettlement(first.fixtures, settle(R16_2, FRA));
    expect(retry.changed).toBe(false);
    expect(retry.fixtures).toBe(first.fixtures);
  });

  it('rejects a conflicting winner for an already-settled fixture', () => {
    const first = applySettlement(FIXTURES, settle(R16_2, FRA));
    expect(() => applySettlement(first.fixtures, settle(R16_2, 'PAR'))).toThrow(/already settled/);
  });
});

describe('replaySettlements', () => {
  it('rebuilds the bracket from recorded events', () => {
    const { fixtures, skipped } = replaySettlements(FIXTURES, [
      settle('R16-1', 'MAR'),
      settle(R16_2, FRA),
    ]);
    const quarterFinal = byId(fixtures, QF_1);
    expect(skipped).toEqual([]);
    expect(quarterFinal.homeTeamId).toBe('MAR');
    expect(quarterFinal.awayTeamId).toBe(FRA);
    expect(priceableFixtures(fixtures).map((fixture) => fixture.id)).toContain(QF_1);
  });

  it('is order-insensitive: a dependent result recorded before its feeders still applies', () => {
    const { fixtures, skipped } = replaySettlements(FIXTURES, [
      settle(QF_1, 'MAR'), // depends on the two events below
      settle('R16-1', 'MAR'),
      settle(R16_2, FRA),
    ]);
    expect(skipped).toEqual([]);
    expect(byId(fixtures, QF_1).status).toBe('finished');
    expect(byId(fixtures, QF_1).winnerTeamId).toBe('MAR');
    expect(byId(fixtures, 'SF-1').homeTeamId).toBe('MAR');
  });

  it('skips stale events instead of failing (a re-seeded bracket must not wedge the service)', () => {
    const stale = settle('OLD-99', FRA);
    const { fixtures, skipped } = replaySettlements(FIXTURES, [stale, settle(R16_2, FRA)]);
    expect(skipped).toEqual([stale]);
    expect(byId(fixtures, R16_2).status).toBe('finished');
  });

  it('skips a conflicting duplicate and keeps the first recorded winner', () => {
    const conflicting = settle(R16_2, 'PAR');
    const { fixtures, skipped } = replaySettlements(FIXTURES, [settle(R16_2, FRA), conflicting]);
    expect(skipped).toEqual([conflicting]);
    expect(byId(fixtures, R16_2).winnerTeamId).toBe(FRA);
  });

  it('treats an exact duplicate event as a no-op, not a skip', () => {
    const { fixtures, skipped } = replaySettlements(FIXTURES, [
      settle(R16_2, FRA),
      settle(R16_2, FRA),
    ]);
    expect(skipped).toEqual([]);
    expect(byId(fixtures, R16_2).status).toBe('finished');
  });

  it('only tolerates settlement errors — unexpected failures propagate', () => {
    expect(() => replaySettlements(null as unknown as Fixture[], [settle(R16_2, FRA)])).toThrow(
      TypeError
    );
  });
});

describe('priceableFixtures', () => {
  it('finds the 12 fixtures with both teams known in the seed bracket', () => {
    expect(priceableFixtures(FIXTURES)).toHaveLength(12);
  });
});

describe('aliveTeams', () => {
  it('counts all 24 seeded teams alive before any result', () => {
    expect(aliveTeams(FIXTURES)).toHaveLength(24);
  });

  it('eliminates the loser once a fixture settles', () => {
    const { fixtures } = applySettlement(FIXTURES, settle(R16_2, FRA));
    const alive = aliveTeams(fixtures);
    expect(alive).toHaveLength(23);
    expect(alive).not.toContain('PAR');
    expect(alive).toContain(FRA);
  });
});

describe('finalFixture', () => {
  it('is the one fixture feeding into nothing', () => {
    expect(finalFixture(FIXTURES)?.id).toBe('F-1');
  });
});
