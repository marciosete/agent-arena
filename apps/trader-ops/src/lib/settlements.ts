import { teamById, type Fixture, type Round } from '@arena/contracts';

/** One settled knockout result, denormalised for the trader feed. */
export interface SettlementRow {
  fixtureId: string;
  round: Round;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  winnerName: string;
  decidedOnPenalties: boolean;
  marketId: string;
  kickoff: string;
}

/** A fixture that has fully resolved: played to a winner with both scores in. */
interface SettledFixture extends Fixture {
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
}

function isSettled(fixture: Fixture): fixture is SettledFixture {
  return (
    fixture.status === 'finished' &&
    fixture.homeScore !== null &&
    fixture.awayScore !== null &&
    fixture.winnerTeamId !== null
  );
}

/** Resolve a team id to its display name; an unknown id shows raw, a TBD slot as 'TBD'. */
function teamName(id: string | null): string {
  if (id === null) {
    return 'TBD';
  }
  return teamById(id)?.name ?? id;
}

/**
 * The settlement feed: every fully-finished fixture as a denormalised row,
 * newest kickoff first. A `MATCH_WINNER` market id equals its fixture id
 * (integration §3), so `marketId` is derived, not looked up. Penalties are
 * derived — a level score with a declared winner means a shootout.
 */
export function deriveSettlements(fixtures: readonly Fixture[]): SettlementRow[] {
  return fixtures
    .filter(isSettled)
    .map((fixture) => ({
      fixtureId: fixture.id,
      round: fixture.round,
      homeName: teamName(fixture.homeTeamId),
      awayName: teamName(fixture.awayTeamId),
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      winnerName: teamName(fixture.winnerTeamId),
      decidedOnPenalties: fixture.homeScore === fixture.awayScore,
      marketId: fixture.id,
      kickoff: fixture.kickoff,
    }))
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff));
}

/**
 * Fold the latest rows into a stable observation order: fixtures not seen in
 * `prevOrder` surface on top (in the rows' own order — newest first), then the
 * previously-seen survivors keep their order; ids no longer present are pruned.
 */
export function mergeObservedOrder(
  prevOrder: readonly string[],
  rows: readonly SettlementRow[]
): string[] {
  const present = new Set(rows.map((row) => row.fixtureId));
  const known = new Set(prevOrder);
  const fresh = rows.filter((row) => !known.has(row.fixtureId)).map((row) => row.fixtureId);
  const survivors = prevOrder.filter((id) => present.has(id));
  return [...fresh, ...survivors];
}
