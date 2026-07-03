import { FIXTURES, fixtureById, TEAMS, type Team } from '@arena/contracts';

/**
 * Pricing's view of bracket progression. Only the mutable half lives here
 * (who fills each slot, who won); the static structure — round, kickoff,
 * feedsInto/feedsIntoSlot — is always read from the contract FIXTURES.
 */
export interface FixtureSlots {
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
}

/** fixtureId → slots, for every fixture in the bracket. */
export type BracketState = ReadonlyMap<string, FixtureSlots>;

/**
 * The seed bracket with results already played in the real world applied:
 * the seed records winners on finished fixtures but leaves downstream slots
 * null, and no reprice will ever arrive for pre-seed results — so winners
 * are propagated here (seed order is topological, so results cascade).
 */
export function initialBracketState(): Map<string, FixtureSlots> {
  const state = new Map<string, FixtureSlots>(
    FIXTURES.map((fixture) => [
      fixture.id,
      {
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        winnerTeamId: fixture.winnerTeamId,
      },
    ])
  );
  for (const fixture of FIXTURES) {
    if (fixture.winnerTeamId === null || fixture.feedsInto === null) {
      continue;
    }
    const downstream = state.get(fixture.feedsInto);
    if (downstream) {
      if (fixture.feedsIntoSlot === 'home') {
        downstream.homeTeamId = fixture.winnerTeamId;
      } else {
        downstream.awayTeamId = fixture.winnerTeamId;
      }
    }
  }
  return state;
}

/** The final feeds into nothing. */
export function isFinalFixture(fixtureId: string): boolean {
  return fixtureById(fixtureId)?.feedsInto === null;
}

/**
 * Record a fixture's winner and advance them into the next fixture's open
 * slot (per feedsInto/feedsIntoSlot). Pure: returns a new state.
 */
export function applySettlement(
  state: BracketState,
  fixtureId: string,
  winnerTeamId: string
): Map<string, FixtureSlots> {
  const fixture = fixtureById(fixtureId);
  if (!fixture || !state.has(fixtureId)) {
    throw new Error(`Unknown fixture: ${fixtureId}`);
  }
  const next = new Map<string, FixtureSlots>();
  for (const [id, slots] of state) {
    next.set(id, { ...slots });
  }
  const settled = next.get(fixtureId) as FixtureSlots;
  settled.winnerTeamId = winnerTeamId;

  if (fixture.feedsInto !== null && fixture.feedsIntoSlot !== null) {
    const downstream = next.get(fixture.feedsInto);
    if (!downstream) {
      throw new Error(`Fixture ${fixtureId} feeds into unknown fixture ${fixture.feedsInto}`);
    }
    if (fixture.feedsIntoSlot === 'home') {
      downstream.homeTeamId = winnerTeamId;
    } else {
      downstream.awayTeamId = winnerTeamId;
    }
  }
  return next;
}

/** A fixture is priceable when both team slots are known and it has no winner yet. */
export function priceableFixtureIds(state: BracketState): string[] {
  return FIXTURES.filter((fixture) => {
    const slots = state.get(fixture.id);
    return (
      slots !== undefined &&
      slots.homeTeamId !== null &&
      slots.awayTeamId !== null &&
      slots.winnerTeamId === null
    );
  }).map((fixture) => fixture.id);
}

/** Teams that have not lost a settled fixture — the outright's selections. */
export function aliveTeams(state: BracketState): Team[] {
  const eliminated = new Set<string>();
  for (const slots of state.values()) {
    if (slots.winnerTeamId === null) {
      continue;
    }
    const loser = slots.winnerTeamId === slots.homeTeamId ? slots.awayTeamId : slots.homeTeamId;
    if (loser !== null) {
      eliminated.add(loser);
    }
  }
  return TEAMS.filter((team) => !eliminated.has(team.id));
}
