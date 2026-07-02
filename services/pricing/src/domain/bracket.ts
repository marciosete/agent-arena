import type { Fixture, Round, SettlementEvent } from '@arena/contracts';

/** Knockout rounds in play order — Monte Carlo walks fixtures this way. */
export const ROUND_ORDER: readonly Round[] = ['R32', 'R16', 'QF', 'SF', 'F'];

/** A settlement that cannot be applied to the current bracket (maps to a 400). */
export class SettlementError extends Error {}

export interface SettlementResult {
  fixtures: Fixture[];
  /** false when this exact settlement was already applied (idempotent retry) */
  changed: boolean;
}

/**
 * Apply a settlement to the bracket: record the result, mark the fixture
 * finished, and advance the winner into the next fixture's open
 * feedsInto/feedsIntoSlot. Pure — returns a new fixtures array.
 */
export function applySettlement(
  fixtures: Fixture[],
  settlement: SettlementEvent
): SettlementResult {
  const fixture = fixtures.find((candidate) => candidate.id === settlement.fixtureId);
  if (!fixture) {
    throw new SettlementError(`Unknown fixture '${settlement.fixtureId}'`);
  }
  if (fixture.status === 'finished') {
    if (fixture.winnerTeamId === settlement.winnerTeamId) {
      return { fixtures, changed: false };
    }
    throw new SettlementError(
      `Fixture '${fixture.id}' is already settled with winner '${fixture.winnerTeamId}'`
    );
  }
  if (!fixture.homeTeamId || !fixture.awayTeamId) {
    throw new SettlementError(`Fixture '${fixture.id}' does not have both teams decided yet`);
  }
  if (
    settlement.winnerTeamId !== fixture.homeTeamId &&
    settlement.winnerTeamId !== fixture.awayTeamId
  ) {
    throw new SettlementError(
      `Winner '${settlement.winnerTeamId}' is not playing in fixture '${fixture.id}'`
    );
  }

  const next = fixtures.map((candidate) => {
    if (candidate.id === fixture.id) {
      return {
        ...candidate,
        status: 'finished' as const,
        homeScore: settlement.homeScore,
        awayScore: settlement.awayScore,
        winnerTeamId: settlement.winnerTeamId,
      };
    }
    if (candidate.id === fixture.feedsInto && fixture.feedsIntoSlot) {
      return fixture.feedsIntoSlot === 'home'
        ? { ...candidate, homeTeamId: settlement.winnerTeamId }
        : { ...candidate, awayTeamId: settlement.winnerTeamId };
    }
    return candidate;
  });
  return { fixtures: next, changed: true };
}

export interface ReplayResult {
  fixtures: Fixture[];
  /** recorded events that no longer fit the bracket (stale seed, conflicts) */
  skipped: SettlementEvent[];
}

/**
 * Rebuild the live bracket from the frozen seed plus every recorded
 * settlement — boot-time recovery. Order-insensitive: passes repeat until no
 * settlement makes progress, so a feeder result recorded "after" its dependent
 * (e.g. equal DB timestamps) still applies. Tolerant: events that can never
 * apply (a fixture missing from a re-seeded bracket, a conflicting winner) are
 * reported as skipped instead of wedging the service.
 */
export function replaySettlements(
  fixtures: Fixture[],
  settlements: SettlementEvent[]
): ReplayResult {
  let bracket = fixtures;
  let pending = settlements;
  for (;;) {
    const deferred: SettlementEvent[] = [];
    let progressed = false;
    for (const settlement of pending) {
      try {
        const result = applySettlement(bracket, settlement);
        bracket = result.fixtures;
        progressed = progressed || result.changed;
      } catch (error) {
        if (!(error instanceof SettlementError)) {
          throw error;
        }
        deferred.push(settlement);
      }
    }
    if (deferred.length === 0 || !progressed) {
      return { fixtures: bracket, skipped: deferred };
    }
    pending = deferred;
  }
}

/** A fixture is priceable once both team slots are known. */
export function priceableFixtures(fixtures: Fixture[]): Fixture[] {
  return fixtures.filter((fixture) => fixture.homeTeamId !== null && fixture.awayTeamId !== null);
}

/** Teams still in the tournament: everyone in the bracket minus the losers. */
export function aliveTeams(fixtures: Fixture[]): string[] {
  const inBracket = new Set<string>();
  const eliminated = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.homeTeamId) inBracket.add(fixture.homeTeamId);
    if (fixture.awayTeamId) inBracket.add(fixture.awayTeamId);
    if (fixture.status === 'finished' && fixture.winnerTeamId) {
      const loser =
        fixture.winnerTeamId === fixture.homeTeamId ? fixture.awayTeamId : fixture.homeTeamId;
      if (loser) eliminated.add(loser);
    }
  }
  return [...inBracket].filter((teamId) => !eliminated.has(teamId));
}

/** The final is the one fixture that feeds into nothing. */
export function finalFixture(fixtures: Fixture[]): Fixture | undefined {
  return fixtures.find((fixture) => fixture.feedsInto === null);
}
