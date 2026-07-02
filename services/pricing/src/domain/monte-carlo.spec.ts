import { FIXTURES, TEAMS, type Fixture } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { applySettlement } from './bracket';
import { DEFAULT_MC_RUNS, simulateChampionProbabilities } from './monte-carlo';
import { mulberry32 } from './rng';

const RUNS = 10_000;

function simulate(fixtures: Fixture[], runs = RUNS, seed = 42): Map<string, number> {
  return simulateChampionProbabilities(fixtures, TEAMS, runs, mulberry32(seed));
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: 'F-1',
    round: 'F',
    kickoff: '2026-07-19T19:00:00.000Z',
    homeTeamId: 'FRA',
    awayTeamId: 'ESP',
    feedsInto: null,
    feedsIntoSlot: null,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    ...overrides,
  };
}

describe('simulateChampionProbabilities', () => {
  it('is deterministic under a fixed seed', () => {
    expect(simulate(FIXTURES)).toEqual(simulate(FIXTURES));
  });

  it('produces different samples under different seeds', () => {
    expect(simulate(FIXTURES, RUNS, 1)).not.toEqual(simulate(FIXTURES, RUNS, 2));
  });

  it('defaults to at least 10,000 runs (the spec floor)', () => {
    expect(DEFAULT_MC_RUNS).toBeGreaterThanOrEqual(10_000);
  });

  it('yields probabilities that sum to 1', () => {
    const total = [...simulate(FIXTURES).values()].reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('rates the strongest seed above a heavy outsider', () => {
    const probabilities = simulate(FIXTURES);
    // Spain (2150) vs Cabo Verde (1550): the model must respect the gap.
    expect(probabilities.get('ESP') ?? 0).toBeGreaterThan(probabilities.get('CPV') ?? 0);
  });

  it('respects results already played: an eliminated team can never be champion', () => {
    const { fixtures } = applySettlement(FIXTURES, {
      fixtureId: 'R16-2',
      winnerTeamId: 'FRA',
      homeScore: 2,
      awayScore: 0,
      decidedOnPenalties: false,
      settledAt: '2026-07-04T23:00:00.000Z',
    });
    const probabilities = simulate(fixtures);
    expect(probabilities.get('PAR')).toBeUndefined();
    expect(probabilities.get('FRA') ?? 0).toBeGreaterThan(0);
  });

  it('simulates a finished fixture missing its winner as if unplayed', () => {
    const final = fixture({ status: 'finished', winnerTeamId: null });
    const probabilities = simulate([final], 100);
    const total = [...probabilities.values()].reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('keeps the real winner of a finished fixture', () => {
    const final = fixture({ status: 'finished', winnerTeamId: 'ESP' });
    expect(simulate([final], 100)).toEqual(new Map([['ESP', 1]]));
  });

  it('throws when a fixture has undecided teams and no feeder', () => {
    expect(() => simulate([fixture({ homeTeamId: null })], 1)).toThrow(/teams undecided/);
  });

  it('throws when a team has no rating', () => {
    expect(() => simulate([fixture({ homeTeamId: 'ZZZ' })], 1)).toThrow(/unknown team rating/);
  });

  it('throws when the bracket has no final', () => {
    expect(() => simulate([], 1)).toThrow(/no final fixture/);
    const dangling = fixture({ id: 'SF-9', feedsInto: 'nowhere', feedsIntoSlot: 'home' });
    expect(() => simulate([dangling], 1)).toThrow(/no final fixture/);
  });
});

describe('mulberry32', () => {
  it('yields a reproducible stream in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
