import type { Fixture } from '@arena/contracts';

/**
 * The Round-of-32 prologue — display-only history.
 *
 * The frozen contract seed compresses the real bracket: the eight R32 games
 * already decided before the platform snapshot (29 June – 2 July) are dropped,
 * and their winners are pre-placed straight into R16. That loses who they beat
 * — the key art shows Brazil advancing past a greyed-out Japan. This module
 * restores that history for the BRACKET VISUAL ONLY: these fixtures and teams
 * never touch markets, bets or the simulator, and `withPrologue` refuses to add
 * an entry whenever the live data already covers it or disagrees with it, so
 * the moment the platform ships real R32 data this whole file goes inert.
 */
export interface PrologueTeam {
  id: string;
  name: string;
  flag: string;
}

export const PROLOGUE_TEAMS: PrologueTeam[] = [
  { id: 'RSA', name: 'South Africa', flag: '🇿🇦' },
  { id: 'NED', name: 'Netherlands', flag: '🇳🇱' },
  { id: 'GER', name: 'Germany', flag: '🇩🇪' },
  { id: 'SWE', name: 'Sweden', flag: '🇸🇪' },
  { id: 'JPN', name: 'Japan', flag: '🇯🇵' },
  { id: 'CIV', name: 'Ivory Coast', flag: '🇨🇮' },
  { id: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
  { id: 'COD', name: 'DR Congo', flag: '🇨🇩' },
];

const PROLOGUE_TEAM_BY_ID = new Map(PROLOGUE_TEAMS.map((team) => [team.id, team]));

export function prologueTeamById(id: string): PrologueTeam | undefined {
  return PROLOGUE_TEAM_BY_ID.get(id);
}

/** Real results, 29 June – 2 July 2026. Level scores with a winner = penalties. */
export const PROLOGUE_FIXTURES: Fixture[] = [
  prologueFixture({
    id: 'R32-1',
    kickoff: '2026-06-29T17:00:00Z',
    homeTeamId: 'RSA',
    awayTeamId: 'CAN',
    homeScore: 0,
    awayScore: 1,
    winnerTeamId: 'CAN',
    feedsInto: 'R16-1',
    feedsIntoSlot: 'home',
  }),
  prologueFixture({
    id: 'R32-2',
    kickoff: '2026-06-30T17:00:00Z',
    homeTeamId: 'NED',
    awayTeamId: 'MAR',
    homeScore: 1,
    awayScore: 1,
    winnerTeamId: 'MAR',
    feedsInto: 'R16-1',
    feedsIntoSlot: 'away',
  }),
  prologueFixture({
    id: 'R32-3',
    kickoff: '2026-06-30T21:00:00Z',
    homeTeamId: 'GER',
    awayTeamId: 'PAR',
    homeScore: 1,
    awayScore: 1,
    winnerTeamId: 'PAR',
    feedsInto: 'R16-2',
    feedsIntoSlot: 'home',
  }),
  prologueFixture({
    id: 'R32-4',
    kickoff: '2026-07-01T17:00:00Z',
    homeTeamId: 'FRA',
    awayTeamId: 'SWE',
    homeScore: 3,
    awayScore: 0,
    winnerTeamId: 'FRA',
    feedsInto: 'R16-2',
    feedsIntoSlot: 'away',
  }),
  prologueFixture({
    id: 'R32-5',
    kickoff: '2026-06-30T00:00:00Z',
    homeTeamId: 'BRA',
    awayTeamId: 'JPN',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: 'BRA',
    feedsInto: 'R16-3',
    feedsIntoSlot: 'home',
  }),
  prologueFixture({
    id: 'R32-6',
    kickoff: '2026-07-01T21:00:00Z',
    homeTeamId: 'CIV',
    awayTeamId: 'NOR',
    homeScore: 1,
    awayScore: 2,
    winnerTeamId: 'NOR',
    feedsInto: 'R16-3',
    feedsIntoSlot: 'away',
  }),
  prologueFixture({
    id: 'R32-7',
    kickoff: '2026-07-01T23:00:00Z',
    homeTeamId: 'MEX',
    awayTeamId: 'ECU',
    homeScore: 2,
    awayScore: 0,
    winnerTeamId: 'MEX',
    feedsInto: 'R16-4',
    feedsIntoSlot: 'home',
  }),
  prologueFixture({
    id: 'R32-8',
    kickoff: '2026-07-02T00:00:00Z',
    homeTeamId: 'ENG',
    awayTeamId: 'COD',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: 'ENG',
    feedsInto: 'R16-4',
    feedsIntoSlot: 'away',
  }),
];

interface PrologueFixtureSpec {
  id: string;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
  feedsInto: string;
  feedsIntoSlot: 'home' | 'away';
}

function prologueFixture({
  id,
  kickoff,
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  winnerTeamId,
  feedsInto,
  feedsIntoSlot,
}: PrologueFixtureSpec): Fixture {
  return {
    id,
    round: 'R32',
    kickoff,
    homeTeamId,
    awayTeamId,
    feedsInto,
    feedsIntoSlot,
    status: 'finished',
    homeScore,
    awayScore,
    winnerTeamId,
  };
}

/**
 * Merge the prologue into live fixtures for layout. Each entry is added only
 * while the live data leaves its slot unexplained: the id must be unused, the
 * fed slot must have no live feeder, the target fixture must exist, and its
 * occupant must match the historical winner. Anything else means the platform
 * now knows better — the prologue steps aside.
 */
export function withPrologue(fixtures: Fixture[]): Fixture[] {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const fedSlots = new Set(
    fixtures
      .filter((fixture) => fixture.feedsInto && fixture.feedsIntoSlot)
      .map((fixture) => `${fixture.feedsInto}:${fixture.feedsIntoSlot}`)
  );
  const additions = PROLOGUE_FIXTURES.filter((entry) => {
    if (byId.has(entry.id) || fedSlots.has(`${entry.feedsInto}:${entry.feedsIntoSlot}`)) {
      return false;
    }
    const target = byId.get(entry.feedsInto as string);
    if (!target) {
      return false;
    }
    const occupant = entry.feedsIntoSlot === 'home' ? target.homeTeamId : target.awayTeamId;
    return occupant === entry.winnerTeamId;
  });
  return additions.length > 0 ? [...additions, ...fixtures] : fixtures;
}
