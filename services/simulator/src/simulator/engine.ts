import {
  teamById,
  type Fixture,
  type Market,
  type Selection,
  type SettleRequest,
  type SettlementEvent,
  type Team,
} from '@arena/contracts';
import type { Rng } from './rng';

/**
 * Pure tournament logic: who wins, by what score, and where the winner goes
 * next. No I/O, no clock, no global state — everything is driven by the
 * caller's fixtures array and a seedable Rng, so all of it unit-tests
 * deterministically. Advancement is the piece that silently breaks brackets,
 * hence it lives here, not in the service.
 */

/** Poisson(λ) truncated at 4 keeps scorelines knockout-plausible (0–4 typical). */
const GOALS_LAMBDA = 1.3;
const MAX_GOALS = 4;

export interface FixtureResult {
  winnerTeamId: string;
  /** oriented to the fixture's homeTeamId/awayTeamId */
  homeScore: number;
  awayScore: number;
  /** scores level after extra time — the drawn winner took the shootout */
  decidedOnPenalties: boolean;
}

/** One winning selection per affected market — the contract's own `SettleRequest` element. */
export type WinningSelection = SettleRequest['winningSelections'][number];

/** Standard Elo logistic curve: P(home beats away). */
export function winProbability(eloHome: number, eloAway: number): number {
  return 1 / (1 + 10 ** ((eloAway - eloHome) / 400));
}

/** Inverse-CDF draw from the truncated Poisson goal distribution. */
export function sampleGoals(rng: Rng): number {
  const draw = rng();
  let cumulative = 0;
  let probability = Math.exp(-GOALS_LAMBDA);
  for (let goals = 0; goals < MAX_GOALS; goals += 1) {
    cumulative += probability;
    if (draw < cumulative) {
      return goals;
    }
    probability = (probability * GOALS_LAMBDA) / (goals + 1);
  }
  return MAX_GOALS;
}

function mustTeam(teamId: string): Team {
  const team = teamById(teamId);
  if (!team) {
    throw new Error(`unknown team id '${teamId}' — not in the TEAMS seed`);
  }
  return team;
}

/**
 * Decide a fixture: winner drawn from Elo-derived probabilities, scores drawn
 * Poisson-ish and kept consistent with the drawn winner (winner's goals ≥
 * loser's; equal ⇒ penalties). Both slots must be filled — advancement
 * guarantees that for the next unplayed fixture in kickoff order.
 */
export function simulateFixture(fixture: Fixture, rng: Rng): FixtureResult {
  if (!fixture.homeTeamId || !fixture.awayTeamId) {
    throw new Error(`fixture ${fixture.id} has an undetermined slot — cannot simulate`);
  }
  const home = mustTeam(fixture.homeTeamId);
  const away = mustTeam(fixture.awayTeamId);

  const homeWins = rng() < winProbability(home.elo, away.elo);
  const goalsA = sampleGoals(rng);
  const goalsB = sampleGoals(rng);
  const winnerGoals = Math.max(goalsA, goalsB);
  const loserGoals = Math.min(goalsA, goalsB);

  return {
    winnerTeamId: homeWins ? home.id : away.id,
    homeScore: homeWins ? winnerGoals : loserGoals,
    awayScore: homeWins ? loserGoals : winnerGoals,
    decidedOnPenalties: winnerGoals === loserGoals,
  };
}

/**
 * Record a result on the bracket: mark the fixture finished and advance the
 * winner into the `feedsInto` fixture's `feedsIntoSlot`. Mutates the caller's
 * fixtures in place — the service owns the single live copy.
 */
export function applyResult(fixtures: Fixture[], fixture: Fixture, result: FixtureResult): void {
  fixture.homeScore = result.homeScore;
  fixture.awayScore = result.awayScore;
  fixture.winnerTeamId = result.winnerTeamId;
  fixture.status = 'finished';

  if (fixture.feedsInto === null || fixture.feedsIntoSlot === null) {
    return; // the final: nobody to advance to
  }
  const next = fixtures.find((candidate) => candidate.id === fixture.feedsInto);
  if (!next) {
    throw new Error(`fixture ${fixture.id} feeds into unknown fixture '${fixture.feedsInto}'`);
  }
  if (fixture.feedsIntoSlot === 'home') {
    next.homeTeamId = result.winnerTeamId;
  } else {
    next.awayTeamId = result.winnerTeamId;
  }
}

/** The next unplayed fixture in kickoff order, or undefined when all are played. */
export function nextUnplayedFixture(fixtures: Fixture[]): Fixture | undefined {
  return [...fixtures]
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    .find((fixture) => fixture.status !== 'finished');
}

function winningSelectionOf(market: Market, winnerName: string): Selection {
  const selection = market.selections.find((candidate) => candidate.name === winnerName);
  if (!selection) {
    throw new Error(`market ${market.id} has no selection named '${winnerName}'`);
  }
  return selection;
}

/**
 * The §3 join — the fragile step of the finale chain. Resolve the winning
 * selection ids from PRICING'S OWN reprice response, matching by team name
 * (`Selection.name` === `Team.name`, the load-bearing convention). Never
 * guess an id format: pricing owns selection ids. When the final was played,
 * the OUTRIGHT market settles for the champion too. Throws when the expected
 * market or selection is missing — settling with a wrong/partial list would
 * mark winning bets lost, so the caller must skip settlement instead.
 */
export function resolveWinningSelections(
  markets: Market[],
  settlement: SettlementEvent,
  options: { finalPlayed: boolean }
): WinningSelection[] {
  const winnerName = mustTeam(settlement.winnerTeamId).name;

  const matchMarket = markets.find(
    (market) => market.type === 'MATCH_WINNER' && market.fixtureId === settlement.fixtureId
  );
  if (!matchMarket) {
    throw new Error(
      `reprice response has no MATCH_WINNER market for fixture ${settlement.fixtureId}`
    );
  }
  const winning: WinningSelection[] = [
    { marketId: matchMarket.id, selectionId: winningSelectionOf(matchMarket, winnerName).id },
  ];

  if (options.finalPlayed) {
    const outright = markets.find((market) => market.type === 'OUTRIGHT');
    if (!outright) {
      throw new Error('final played but reprice response has no OUTRIGHT market');
    }
    winning.push({
      marketId: outright.id,
      selectionId: winningSelectionOf(outright, winnerName).id,
    });
  }

  return winning;
}
