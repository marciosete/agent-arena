import { FIXTURES, TEAMS } from '@arena/contracts';
import type { BracketState } from './bracket';
import { winProbability } from './elo';
import type { Rng } from './rng';

/** DoD: the outright is priced by ≥10,000 simulations of the remaining bracket. */
export const OUTRIGHT_RUNS = 10_000;

const eloByTeamId = new Map(TEAMS.map((team) => [team.id, team.elo]));

function eloOf(teamId: string): number {
  const elo = eloByTeamId.get(teamId);
  if (elo === undefined) {
    throw new Error(`Unknown team: ${teamId}`);
  }
  return elo;
}

/**
 * The bracket flattened to parallel arrays (FIXTURES seed order is already
 * topological R32→F), so each of the 10k runs copies two flat arrays instead
 * of allocating a Map of objects.
 */
interface CompiledBracket {
  ids: string[];
  baseHome: (string | null)[];
  baseAway: (string | null)[];
  knownWinner: (string | null)[];
  /** index of the fixture the winner advances to; -1 for the final */
  feedsIntoIndex: number[];
  fillsHomeSlot: boolean[];
}

function compileBracket(state: BracketState): CompiledBracket {
  const indexById = new Map(FIXTURES.map((fixture, index) => [fixture.id, index]));
  const compiled: CompiledBracket = {
    ids: [],
    baseHome: [],
    baseAway: [],
    knownWinner: [],
    feedsIntoIndex: [],
    fillsHomeSlot: [],
  };
  for (const fixture of FIXTURES) {
    const slots = state.get(fixture.id);
    compiled.ids.push(fixture.id);
    compiled.baseHome.push(slots?.homeTeamId ?? null);
    compiled.baseAway.push(slots?.awayTeamId ?? null);
    compiled.knownWinner.push(slots?.winnerTeamId ?? null);
    compiled.feedsIntoIndex.push(
      fixture.feedsInto === null ? -1 : (indexById.get(fixture.feedsInto) ?? -1)
    );
    compiled.fillsHomeSlot.push(fixture.feedsIntoSlot === 'home');
  }
  return compiled;
}

/**
 * One tournament: keep winners already settled in the state, sample every
 * undecided tie with the Elo expectation, propagate winners along the
 * feedsInto links, and return the champion.
 */
function simulateChampion(compiled: CompiledBracket, rng: Rng): string {
  const home = compiled.baseHome.slice();
  const away = compiled.baseAway.slice();
  let champion: string | null = null;
  for (let i = 0; i < compiled.ids.length; i += 1) {
    let winner = compiled.knownWinner[i] ?? null;
    if (winner === null) {
      const homeTeam = home[i] ?? null;
      const awayTeam = away[i] ?? null;
      if (homeTeam === null || awayTeam === null) {
        throw new Error(`Unresolved slots for fixture ${compiled.ids[i]}`);
      }
      winner = rng() < winProbability(eloOf(homeTeam), eloOf(awayTeam)) ? homeTeam : awayTeam;
    }
    const target = compiled.feedsIntoIndex[i] ?? -1;
    if (target === -1) {
      champion = winner;
    } else if (compiled.fillsHomeSlot[i]) {
      home[target] = winner;
    } else {
      away[target] = winner;
    }
  }
  if (champion === null) {
    // Unreachable with the contract FIXTURES; fail loudly rather than misprice.
    throw new Error('Bracket has no final fixture');
  }
  return champion;
}

/**
 * Champion probability per team, by Monte Carlo over the remaining bracket.
 * Deterministic for a given `rng` seed.
 */
export function championProbabilities(
  state: BracketState,
  runs: number,
  rng: Rng
): Map<string, number> {
  const compiled = compileBracket(state);
  const wins = new Map<string, number>();
  for (let run = 0; run < runs; run += 1) {
    const champion = simulateChampion(compiled, rng);
    wins.set(champion, (wins.get(champion) ?? 0) + 1);
  }
  const probabilities = new Map<string, number>();
  for (const [teamId, count] of wins) {
    probabilities.set(teamId, count / runs);
  }
  return probabilities;
}
