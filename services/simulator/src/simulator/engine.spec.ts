import { describe, expect, it } from 'vitest';
import {
  FIXTURES,
  SettlementEventSchema,
  SimStateSchema,
  fixtureById,
  type Fixture,
  type SettlementEvent,
  type SimState,
} from '@arena/contracts';
import { createRng } from './rng';
import {
  initialSimState,
  nextUnplayedFixture,
  playNextFixture,
  simulateResult,
  winProbabilityHome,
} from './engine';

const SETTLED_AT = '2026-07-03T12:00:00.000Z';
const FIRST_KICKOFF_ID = 'R32-9'; // POR v CRO, earliest kickoff in the seed

function playAll(seed: number): { state: SimState; settlements: SettlementEvent[] } {
  const rng = createRng(seed);
  let state = initialSimState();
  const settlements: SettlementEvent[] = [];
  for (let i = 0; i < FIXTURES.length; i += 1) {
    const outcome = playNextFixture(state, rng, SETTLED_AT);
    if (!outcome) break;
    state = outcome.state;
    settlements.push(outcome.settlement);
  }
  return { state, settlements };
}

describe('winProbabilityHome', () => {
  it('gives even odds to equal Elo ratings', () => {
    expect(winProbabilityHome(1900, 1900)).toBeCloseTo(0.5, 10);
  });

  it('gives a 400-point favourite the canonical 10/11 chance', () => {
    expect(winProbabilityHome(2200, 1800)).toBeCloseTo(10 / 11, 10);
  });

  it('is complementary when home and away swap', () => {
    expect(winProbabilityHome(2000, 1850) + winProbabilityHome(1850, 2000)).toBeCloseTo(1, 10);
  });
});

describe('simulateResult', () => {
  const porVsCro = fixtureById(FIRST_KICKOFF_ID) as Fixture;

  it('is deterministic under a fixed seed', () => {
    const resultA = simulateResult(porVsCro, createRng(1234));
    const resultB = simulateResult(porVsCro, createRng(1234));
    expect(resultA).toEqual(resultB);
  });

  it('always keeps the scoreline consistent with the drawn winner', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const result = simulateResult(porVsCro, createRng(seed));
      const winnerIsHome = result.winnerTeamId === porVsCro.homeTeamId;
      const winnerScore = winnerIsHome ? result.homeScore : result.awayScore;
      const loserScore = winnerIsHome ? result.awayScore : result.homeScore;

      expect([porVsCro.homeTeamId, porVsCro.awayTeamId]).toContain(result.winnerTeamId);
      expect(Number.isInteger(result.homeScore)).toBe(true);
      expect(Number.isInteger(result.awayScore)).toBe(true);
      expect(winnerScore).toBeGreaterThanOrEqual(loserScore);
      expect(winnerScore).toBeGreaterThanOrEqual(0);
      expect(winnerScore).toBeLessThanOrEqual(4);
      expect(result.decidedOnPenalties).toBe(winnerScore === loserScore);
    }
  });

  it('covers both regulation and penalty outcomes across seeds', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 300; seed += 1) {
      outcomes.add(simulateResult(porVsCro, createRng(seed)).decidedOnPenalties);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('favours the higher-Elo team over many draws', () => {
    const argVsCpv = fixtureById('R32-13') as Fixture; // ARG 2120 v CPV 1550
    let argentinaWins = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      if (simulateResult(argVsCpv, createRng(seed)).winnerTeamId === 'ARG') {
        argentinaWins += 1;
      }
    }
    // P(ARG) ≈ 0.964 — anything near even would signal a broken curve.
    expect(argentinaWins).toBeGreaterThan(340);
  });

  it('refuses to simulate a fixture whose slots are not yet filled', () => {
    const semiFinal = fixtureById('SF-1') as Fixture;
    expect(() => simulateResult(semiFinal, createRng(1))).toThrow(/no home team/);
  });
});

describe('nextUnplayedFixture', () => {
  it('picks the earliest kickoff among unfinished fixtures regardless of array order', () => {
    const fixtures = [...initialSimState().fixtures].reverse();
    expect(nextUnplayedFixture(fixtures)?.id).toBe(FIRST_KICKOFF_ID);
  });

  it('skips finished fixtures', () => {
    const fixtures = initialSimState().fixtures.map((fixture) =>
      fixture.id === FIRST_KICKOFF_ID ? { ...fixture, status: 'finished' as const } : fixture
    );
    expect(nextUnplayedFixture(fixtures)?.id).toBe('R32-10');
  });

  it('returns undefined once everything is played', () => {
    const fixtures = initialSimState().fixtures.map((fixture) => ({
      ...fixture,
      status: 'finished' as const,
    }));
    expect(nextUnplayedFixture(fixtures)).toBeUndefined();
  });
});

describe('playNextFixture', () => {
  it('finishes the fixture and advances the winner into the correct slot', () => {
    const outcome = playNextFixture(initialSimState(), createRng(9), SETTLED_AT);
    expect(outcome).not.toBeNull();

    const played = outcome?.state.fixtures.find((f) => f.id === FIRST_KICKOFF_ID);
    expect(played?.status).toBe('finished');
    expect(played?.winnerTeamId).toBe(outcome?.settlement.winnerTeamId);
    expect(played?.homeScore).toBe(outcome?.settlement.homeScore);
    expect(played?.awayScore).toBe(outcome?.settlement.awayScore);

    // R32-9 feeds the HOME slot of R16-5.
    const next = outcome?.state.fixtures.find((f) => f.id === 'R16-5');
    expect(next?.homeTeamId).toBe(outcome?.settlement.winnerTeamId);
    expect(next?.awayTeamId).toBeNull();
  });

  it('does not mutate the state it was given', () => {
    const state = initialSimState();
    const before = structuredClone(state);
    playNextFixture(state, createRng(9), SETTLED_AT);
    expect(state).toEqual(before);
  });

  it('emits a schema-valid SettlementEvent for the played fixture', () => {
    const outcome = playNextFixture(initialSimState(), createRng(11), SETTLED_AT);
    const settlement = SettlementEventSchema.parse(outcome?.settlement);
    expect(settlement.fixtureId).toBe(FIRST_KICKOFF_ID);
    expect(settlement.settledAt).toBe(SETTLED_AT);
  });

  it('advances every winner into the correct slot of the correct fixture, all the way to the final', () => {
    const { state, settlements } = playAll(2026);

    expect(settlements).toHaveLength(FIXTURES.length);
    expect(state.playedFixtureIds).toHaveLength(FIXTURES.length);
    expect(state.remainingFixtureIds).toEqual([]);
    SimStateSchema.parse(state);

    const byId = new Map(state.fixtures.map((fixture) => [fixture.id, fixture]));
    for (const fixture of state.fixtures) {
      expect(fixture.status).toBe('finished');
      // The winner was one of the two teams that actually contested the fixture.
      expect([fixture.homeTeamId, fixture.awayTeamId]).toContain(fixture.winnerTeamId);
      if (fixture.feedsInto && fixture.feedsIntoSlot) {
        const downstream = byId.get(fixture.feedsInto);
        const slotTeam =
          fixture.feedsIntoSlot === 'home' ? downstream?.homeTeamId : downstream?.awayTeamId;
        expect(slotTeam).toBe(fixture.winnerTeamId);
      }
    }

    const final = byId.get('F-1');
    expect(final?.feedsInto).toBeNull();
    expect(state.champion).toBe(final?.winnerTeamId);
  });

  it('replays the identical tournament under the same seed', () => {
    const first = playAll(42);
    const second = playAll(42);
    expect(second.state).toEqual(first.state);
    expect(second.settlements).toEqual(first.settlements);
  });

  it('plays different tournaments under different seeds', () => {
    expect(playAll(1).settlements).not.toEqual(playAll(2).settlements);
  });

  it('returns null (no-op) when the tournament is complete', () => {
    const { state } = playAll(7);
    expect(playNextFixture(state, createRng(7), SETTLED_AT)).toBeNull();
  });
});
