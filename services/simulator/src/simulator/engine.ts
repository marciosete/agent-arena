import {
  FIXTURES,
  teamById,
  type Fixture,
  type SettlementEvent,
  type SimState,
  type Team,
} from '@arena/contracts';
import type { Rng } from './rng';

/**
 * Pure bracket + result-generation logic. No I/O, no clocks, no ambient
 * randomness — everything the simulation decides flows through the injected
 * {@link Rng}, so a fixed seed replays the identical tournament.
 */

/** P(home wins) — the standard Elo logistic curve over the two teams' ratings. */
export function winProbabilityHome(eloHome: number, eloAway: number): number {
  return 1 / (1 + 10 ** ((eloAway - eloHome) / 400));
}

/**
 * Truncated Poisson(λ ≈ 1.35) inverse CDF over 0–4 goals — plausible knockout
 * scorelines (one or two goals typical, four rare) without a stats dependency.
 */
const GOAL_COUNT_CDF = [0.2592, 0.6091, 0.8453, 0.9516, 1] as const;

function drawGoals(rng: Rng): number {
  const u = rng();
  return GOAL_COUNT_CDF.findIndex((cumulative) => u < cumulative);
}

export interface SimulatedResult {
  winnerTeamId: string;
  homeScore: number;
  awayScore: number;
  decidedOnPenalties: boolean;
}

function requireTeam(teamId: string | null, fixtureId: string, slot: 'home' | 'away'): Team {
  const team = teamId === null ? undefined : teamById(teamId);
  if (!team) {
    throw new Error(`fixture ${fixtureId} has no ${slot} team yet — it cannot be simulated`);
  }
  return team;
}

/**
 * Draw a winner from the Elo-derived probability, then a scoreline consistent
 * with it: the winner's goals are always ≥ the loser's, and a level score
 * means the drawn winner took it on penalties.
 */
export function simulateResult(fixture: Fixture, rng: Rng): SimulatedResult {
  const home = requireTeam(fixture.homeTeamId, fixture.id, 'home');
  const away = requireTeam(fixture.awayTeamId, fixture.id, 'away');
  const homeWins = rng() < winProbabilityHome(home.elo, away.elo);
  let winnerGoals = drawGoals(rng);
  let loserGoals = drawGoals(rng);
  if (loserGoals > winnerGoals) {
    [winnerGoals, loserGoals] = [loserGoals, winnerGoals];
  }
  return {
    winnerTeamId: homeWins ? home.id : away.id,
    homeScore: homeWins ? winnerGoals : loserGoals,
    awayScore: homeWins ? loserGoals : winnerGoals,
    decidedOnPenalties: winnerGoals === loserGoals,
  };
}

/** The next fixture to play: earliest kickoff among the not-yet-finished. */
export function nextUnplayedFixture(fixtures: readonly Fixture[]): Fixture | undefined {
  return fixtures
    .filter((fixture) => fixture.status !== 'finished')
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0];
}

function deriveFixtureIds(
  fixtures: readonly Fixture[]
): Pick<SimState, 'playedFixtureIds' | 'remainingFixtureIds'> {
  return {
    playedFixtureIds: fixtures.filter((f) => f.status === 'finished').map((f) => f.id),
    remainingFixtureIds: fixtures.filter((f) => f.status !== 'finished').map((f) => f.id),
  };
}

/** A fresh copy of the real-world seed bracket. */
export function initialSimState(): SimState {
  const fixtures = FIXTURES.map((fixture) => ({ ...fixture }));
  return { fixtures, champion: null, ...deriveFixtureIds(fixtures) };
}

export interface PlayedFixtureOutcome {
  /** the bracket after the fixture finished and its winner advanced */
  state: SimState;
  settlement: SettlementEvent;
  /** true when the final was just played — the OUTRIGHT market settles too */
  isFinal: boolean;
}

/**
 * Play the next unplayed fixture: simulate a result, mark it finished, and
 * advance the winner into `feedsInto`/`feedsIntoSlot` on the next fixture.
 * Returns null when the tournament is already complete (a no-op for callers).
 */
export function playNextFixture(
  state: SimState,
  rng: Rng,
  settledAt: string
): PlayedFixtureOutcome | null {
  const next = nextUnplayedFixture(state.fixtures);
  if (!next) {
    return null;
  }

  const result = simulateResult(next, rng);
  const fixtures = state.fixtures.map((fixture) => {
    if (fixture.id === next.id) {
      return {
        ...fixture,
        status: 'finished' as const,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winnerTeamId: result.winnerTeamId,
      };
    }
    if (fixture.id === next.feedsInto && next.feedsIntoSlot !== null) {
      return next.feedsIntoSlot === 'home'
        ? { ...fixture, homeTeamId: result.winnerTeamId }
        : { ...fixture, awayTeamId: result.winnerTeamId };
    }
    return fixture;
  });

  const isFinal = next.feedsInto === null;
  return {
    state: {
      fixtures,
      champion: isFinal ? result.winnerTeamId : state.champion,
      ...deriveFixtureIds(fixtures),
    },
    settlement: {
      fixtureId: next.id,
      winnerTeamId: result.winnerTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      decidedOnPenalties: result.decidedOnPenalties,
      settledAt,
    },
    isFinal,
  };
}
