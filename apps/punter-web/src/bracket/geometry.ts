import type { Fixture, Round } from '@arena/contracts';

/**
 * Data-driven radial layout for the Road-to-the-Final bracket.
 *
 * Pure math, no React: fixtures are grouped by round onto concentric rings and
 * placed by angle. Entry slots (slots no other fixture feeds, i.e. teams known
 * from the start) are the leaves of the tree rooted at the final; a DFS from
 * the final assigns each leaf an even share of the full circle, and every
 * winner-slot sits at the mean angle of its two feeders. The real bracket is
 * irregular — 24 teams, eight of them entering at R16 — so everything is
 * derived from `feedsInto`/`feedsIntoSlot`, never from an assumed 32-leaf tree.
 */

export const VIEW_SIZE = 1000;
export const CENTER = 500;

/** Ring radius per round, outer → inner, converging on the trophy at the centre. */
export const RING_RADIUS: Record<Round, number> = {
  R32: 460,
  R16: 360,
  QF: 250,
  SF: 150,
  F: 70,
};

const START_ANGLE = -Math.PI / 2; // leaves fan out from twelve o'clock
const FULL_TURN = 2 * Math.PI;

export interface Point {
  x: number;
  y: number;
}

export function polarPoint(angle: number, radius: number): Point {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

export type SlotSide = 'home' | 'away';

export interface SlotLayout {
  side: SlotSide;
  angle: number;
  radius: number;
  point: Point;
  /** live occupant from SimState (null until the feeder fixture is decided) */
  teamId: string | null;
  /** id of the fixture whose winner fills this slot; null = an entry slot */
  fedBy: string | null;
}

export interface FixtureLayout {
  fixture: Fixture;
  home: SlotLayout;
  away: SlotLayout;
  /** mean angle of the two slots — where the winner advances along */
  midAngle: number;
  /** where the winner lands: the next-round slot position, or the trophy centre for the final */
  winnerPoint: Point;
  winnerRadius: number;
}

export interface BracketLayout {
  fixtures: FixtureLayout[];
  byId: Map<string, FixtureLayout>;
  leafCount: number;
}

type FeederMap = Map<string, Partial<Record<SlotSide, Fixture>>>;

function buildFeederMap(fixtures: Fixture[]): FeederMap {
  const feeders: FeederMap = new Map();
  for (const fixture of fixtures) {
    if (fixture.feedsInto && fixture.feedsIntoSlot) {
      const entry = feeders.get(fixture.feedsInto) ?? {};
      entry[fixture.feedsIntoSlot] = fixture;
      feeders.set(fixture.feedsInto, entry);
    }
  }
  return feeders;
}

function countLeaves(fixture: Fixture, feeders: FeederMap, seen: Set<string>): number {
  if (seen.has(fixture.id)) {
    return 0; // malformed graph guard — never counts a fixture twice
  }
  seen.add(fixture.id);
  const fed = feeders.get(fixture.id) ?? {};
  const homeLeaves = fed.home ? countLeaves(fed.home, feeders, seen) : 1;
  const awayLeaves = fed.away ? countLeaves(fed.away, feeders, seen) : 1;
  return homeLeaves + awayLeaves;
}

export function layoutBracket(fixtures: Fixture[]): BracketLayout {
  const feeders = buildFeederMap(fixtures);
  const nextRound = new Map(fixtures.map((fixture) => [fixture.id, fixture.round]));
  const roots = fixtures.filter((fixture) => fixture.feedsInto === null);
  const layouts = new Map<string, FixtureLayout>();

  const counted = new Set<string>();
  const leafCount = roots.reduce((sum, root) => sum + countLeaves(root, feeders, counted), 0);

  let leafIndex = 0;
  const placed = new Set<string>();

  const nextLeafAngle = (): number => {
    const angle = START_ANGLE + ((leafIndex + 0.5) / Math.max(leafCount, 1)) * FULL_TURN;
    leafIndex += 1;
    return angle;
  };

  const placeSlot = (fixture: Fixture, side: SlotSide): { angle: number; fedBy: string | null } => {
    const feeder = feeders.get(fixture.id)?.[side];
    if (feeder && !placed.has(feeder.id)) {
      return { angle: place(feeder), fedBy: feeder.id };
    }
    return { angle: nextLeafAngle(), fedBy: null };
  };

  function place(fixture: Fixture): number {
    placed.add(fixture.id);
    const radius = RING_RADIUS[fixture.round];
    const home = placeSlot(fixture, 'home');
    const away = placeSlot(fixture, 'away');
    const midAngle = (home.angle + away.angle) / 2;
    const winnerRound = fixture.feedsInto ? nextRound.get(fixture.feedsInto) : undefined;
    const winnerRadius = winnerRound ? RING_RADIUS[winnerRound] : 0;
    layouts.set(fixture.id, {
      fixture,
      home: makeSlot('home', home, radius, fixture.homeTeamId),
      away: makeSlot('away', away, radius, fixture.awayTeamId),
      midAngle,
      winnerPoint: polarPoint(midAngle, winnerRadius),
      winnerRadius,
    });
    return midAngle;
  }

  for (const root of roots) {
    place(root);
  }

  return { fixtures: [...layouts.values()], byId: layouts, leafCount };
}

function makeSlot(
  side: SlotSide,
  at: { angle: number; fedBy: string | null },
  radius: number,
  teamId: string | null
): SlotLayout {
  return {
    side,
    angle: at.angle,
    radius,
    point: polarPoint(at.angle, radius),
    teamId,
    fedBy: at.fedBy,
  };
}

/**
 * Circuit-board edge from a slot inward to its winner target: a radial run, an
 * arc along a waypoint ring, then a radial run into the target — the language
 * of the key art. Collapses to a straight radial line when angles align.
 */
export function edgePath(
  fromAngle: number,
  fromRadius: number,
  toAngle: number,
  toRadius: number
): string {
  const from = polarPoint(fromAngle, fromRadius);
  const to = polarPoint(toAngle, toRadius);
  const fmt = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  const delta = toAngle - fromAngle;
  if (Math.abs(delta) < 1e-6) {
    return `M ${fmt(from)} L ${fmt(to)}`;
  }
  const waypointRadius = toRadius + (fromRadius - toRadius) * 0.45;
  const bendOut = polarPoint(fromAngle, waypointRadius);
  const bendIn = polarPoint(toAngle, waypointRadius);
  const sweep = delta > 0 ? 1 : 0;
  const r = waypointRadius.toFixed(2);
  return `M ${fmt(from)} L ${fmt(bendOut)} A ${r} ${r} 0 0 ${sweep} ${fmt(bendIn)} L ${fmt(to)}`;
}

/** Teams knocked out so far: every finished fixture eliminates its non-winner. */
export function eliminatedTeamIds(fixtures: Fixture[]): Set<string> {
  const out = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.status === 'finished' && fixture.winnerTeamId) {
      const loser =
        fixture.winnerTeamId === fixture.homeTeamId ? fixture.awayTeamId : fixture.homeTeamId;
      if (loser) {
        out.add(loser);
      }
    }
  }
  return out;
}

/** The losing side of a finished fixture (null while undecided). */
export function loserTeamId(fixture: Fixture): string | null {
  if (fixture.status !== 'finished' || !fixture.winnerTeamId) {
    return null;
  }
  return fixture.winnerTeamId === fixture.homeTeamId ? fixture.awayTeamId : fixture.homeTeamId;
}

/**
 * A team's road to the final: from the outermost fixture it appears in, follow
 * `feedsInto` to the root. Used to light a hovered team's whole branch.
 */
export function teamPathFixtureIds(fixtures: Fixture[], teamId: string): string[] {
  const containing = fixtures.filter(
    (fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId
  );
  if (containing.length === 0) {
    return [];
  }
  const entry = containing.reduce((outermost, candidate) =>
    RING_RADIUS[candidate.round] > RING_RADIUS[outermost.round] ? candidate : outermost
  );
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const path: string[] = [];
  let current: Fixture | undefined = entry;
  while (current && !path.includes(current.id)) {
    path.push(current.id);
    current = current.feedsInto ? byId.get(current.feedsInto) : undefined;
  }
  return path;
}

/**
 * `decidedOnPenalties` lives only on SettlementEvent, so UIs reading /state
 * derive it: a finished fixture with level scores and a winner went to pens.
 */
export function decidedOnPenalties(fixture: Fixture): boolean {
  return (
    fixture.status === 'finished' &&
    fixture.winnerTeamId !== null &&
    fixture.homeScore !== null &&
    fixture.homeScore === fixture.awayScore
  );
}
