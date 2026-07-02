import type { Fixture, Team } from '@arena/contracts';
import { ROUND_ORDER } from './bracket';
import { winProbability } from './elo';
import type { Rng } from './rng';

/** Spec floor: the outright is priced over at least 10,000 simulated brackets. */
export const DEFAULT_MC_RUNS = 10_000;

interface SimulationContext {
  eloByTeam: Map<string, number>;
  rng: Rng;
}

/**
 * Champion probabilities by Monte Carlo simulation of the remaining bracket:
 * finished fixtures keep their real winners, every unplayed fixture is decided
 * by the Elo win probability, winners advance along feedsInto/feedsIntoSlot,
 * and each run's champion is tallied. Deterministic for a given `rng`.
 */
export function simulateChampionProbabilities(
  fixtures: Fixture[],
  teams: Team[],
  runs: number,
  rng: Rng
): Map<string, number> {
  const ordered = [...fixtures].sort(
    (a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round)
  );
  const context: SimulationContext = {
    eloByTeam: new Map(teams.map((team) => [team.id, team.elo])),
    rng,
  };
  const wins = new Map<string, number>();
  for (let run = 0; run < runs; run += 1) {
    const champion = simulateOnce(ordered, context);
    wins.set(champion, (wins.get(champion) ?? 0) + 1);
  }
  return new Map([...wins].map(([teamId, count]) => [teamId, count / runs]));
}

/** Walk the bracket once, front to back, and return the run's champion. */
function simulateOnce(ordered: Fixture[], context: SimulationContext): string {
  // Winners propagated during this run, keyed by the fixture they feed into.
  const advanced = new Map<string, { home?: string; away?: string }>();
  let champion: string | null = null;
  for (const fixture of ordered) {
    const slots = advanced.get(fixture.id);
    const home = fixture.homeTeamId ?? slots?.home ?? null;
    const away = fixture.awayTeamId ?? slots?.away ?? null;
    const winner = resolveWinner(fixture, home, away, context);
    if (fixture.feedsInto && fixture.feedsIntoSlot) {
      const next = advanced.get(fixture.feedsInto) ?? {};
      next[fixture.feedsIntoSlot] = winner;
      advanced.set(fixture.feedsInto, next);
    } else {
      champion = winner;
    }
  }
  if (!champion) {
    throw new Error('Bracket has no final fixture to produce a champion');
  }
  return champion;
}

function resolveWinner(
  fixture: Fixture,
  home: string | null,
  away: string | null,
  context: SimulationContext
): string {
  if (fixture.status === 'finished' && fixture.winnerTeamId) {
    return fixture.winnerTeamId;
  }
  if (!home || !away) {
    throw new Error(`Cannot simulate fixture '${fixture.id}': teams undecided`);
  }
  const homeElo = context.eloByTeam.get(home);
  const awayElo = context.eloByTeam.get(away);
  if (homeElo === undefined || awayElo === undefined) {
    throw new Error(`Cannot simulate fixture '${fixture.id}': unknown team rating`);
  }
  return context.rng() < winProbability(homeElo, awayElo) ? home : away;
}
