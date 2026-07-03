import { teamById, type Fixture } from '@arena/contracts';

/** A finished fixture ready for the settlement feed, with names and market id resolved. */
export interface SettledFixture {
  fixtureId: string;
  round: Fixture['round'];
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  winnerName: string;
  decidedOnPenalties: boolean;
  marketId: string;
  kickoff: string;
}

/** A fixture that has actually produced a result — every settlement field is populated. */
type FinishedFixture = Fixture & {
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
};

function isSettled(fixture: Fixture): fixture is FinishedFixture {
  return (
    fixture.status === 'finished' &&
    fixture.winnerTeamId !== null &&
    fixture.homeScore !== null &&
    fixture.awayScore !== null
  );
}

/** Team name for a slot: known team → its name, unknown id → the raw id, empty slot → '?'. */
function teamName(id: string | null): string {
  if (id === null) {
    return '?';
  }
  return teamById(id)?.name ?? id;
}

/**
 * Derive the settlement feed from live `SimState.fixtures` (never the FIXTURES seed).
 * Only fixtures that have finished with a winner and both scores qualify; the list is
 * newest-first by kickoff (stable tiebreak by fixtureId). `decidedOnPenalties` is not a
 * Fixture field — a level score with a winner means the tie was settled on penalties. The
 * settled MATCH_WINNER market's id equals the fixtureId (integration §3), so it joins directly.
 */
export function deriveSettlements(fixtures: Fixture[]): SettledFixture[] {
  return fixtures
    .filter(isSettled)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff) || a.id.localeCompare(b.id))
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
    }));
}
