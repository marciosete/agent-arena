import type { Fixture, Round } from '@arena/contracts';

/**
 * Data-driven radial layout for the Road to the Final.
 *
 * The bracket is laid out from the fixture GRAPH (feedsInto/feedsIntoSlot), not
 * from which teams currently occupy slots — so the geometry is stable while the
 * simulator propagates winners inward. Entry slots (no feeder fixture) are spread
 * evenly around the full circle in depth-first order from the final, which keeps
 * each subtree in a contiguous angular wedge; every fixture then sits at the mean
 * angle of its two sides, and its winner-slot sits on the next inner ring at that
 * angle. The real 2026 bracket is irregular (24 teams, eight enter at R16), so
 * nothing here assumes a full 32-leaf tree.
 */

export const VIEW_SIZE = 1000;
export const CENTER = VIEW_SIZE / 2;

/**
 * The rim labels sit tangentially ~33 units outside the outer ring, so the SVG
 * viewBox carries a margin around the 1000×1000 coordinate system — otherwise
 * the outermost names clip against the viewport edge. The trophy stays at
 * (500,500), dead centre of the padded box.
 */
export const VIEW_MARGIN = 64;
export const VIEW_BOX = `${-VIEW_MARGIN} ${-VIEW_MARGIN} ${VIEW_SIZE + 2 * VIEW_MARGIN} ${VIEW_SIZE + 2 * VIEW_MARGIN}`;

/** Map an SVG user coordinate to a percentage across the padded viewBox. */
export function toPercent(coordinate: number): number {
  return ((coordinate + VIEW_MARGIN) / (VIEW_SIZE + 2 * VIEW_MARGIN)) * 100;
}

/** Ring radius per round, outermost first; the trophy sits at the centre. */
export const RING_RADIUS: Record<Round, number> = { R32: 460, R16: 360, QF: 250, SF: 150, F: 70 };

/** The outer rim, where every entry team sits regardless of its entry round. */
export const RIM_RADIUS = RING_RADIUS.R32;

export type Slot = 'home' | 'away';
export const SLOTS: readonly Slot[] = ['home', 'away'];

export interface Point {
  x: number;
  y: number;
}

export interface SlotLayout {
  /** `${fixtureId}:${slot}` — also identifies this slot's inward edge. */
  key: string;
  fixtureId: string;
  slot: Slot;
  /** Current occupant: an entry team, a propagated winner, or null (undecided). */
  teamId: string | null;
  /** True when no earlier fixture feeds this slot (the team is known from the structure). */
  isEntry: boolean;
  angle: number;
  /** Where the team's node renders — the rim for every entry team. */
  pos: Point;
  /** Rim position (DFS order) for entry slots — drives label staggering. */
  entryIndex?: number;
  /**
   * Where this slot's fixture edge starts: the fixture's OWN ring. It differs
   * from `pos` only for entry teams of inner rounds — they are already through
   * the earlier round (the seed pre-places the real R32 winners in R16), and
   * that gap renders as a decided hop with an echo node, so every level of the
   * bracket stays visible (the key art's Canada/France/Brazil sitting in R16).
   */
  anchor: Point;
}

export interface FixtureLayout {
  fixture: Fixture;
  angle: number;
  radius: number;
  home: SlotLayout;
  away: SlotLayout;
  /** Where this fixture's winner lands: next inner ring, or the centre for the final. */
  winnerPos: Point;
  /** The winner slot in polar terms — the elbow router needs angle + radius, not just x/y. */
  winnerAngle: number;
  winnerRadius: number;
  /** Midpoint on this fixture's ring, between its two slots — the score chip anchor. */
  labelPos: Point;
}

export interface BracketLayout {
  fixtures: FixtureLayout[];
  byId: Map<string, FixtureLayout>;
}

export function polarToPoint(angleDegrees: number, radius: number): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) };
}

const slotKey = (fixtureId: string, slot: Slot): string => `${fixtureId}:${slot}`;

/** Depth-first from the final: entry slots in order, each subtree a contiguous arc. */
function collectEntrySlots(
  finalId: string,
  byId: Map<string, Fixture>,
  feeders: Map<string, string>
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();
  const visit = (fixtureId: string): void => {
    if (seen.has(fixtureId) || !byId.has(fixtureId)) {
      return;
    }
    seen.add(fixtureId);
    for (const slot of SLOTS) {
      const key = slotKey(fixtureId, slot);
      const feeder = feeders.get(key);
      if (feeder) {
        visit(feeder);
      } else {
        entries.push(key);
      }
    }
  };
  visit(finalId);
  return entries;
}

export function layoutBracket(fixtures: Fixture[]): BracketLayout {
  const byFixtureId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const feeders = new Map<string, string>();
  for (const fixture of fixtures) {
    if (fixture.feedsInto && fixture.feedsIntoSlot) {
      feeders.set(slotKey(fixture.feedsInto, fixture.feedsIntoSlot), fixture.id);
    }
  }

  const final =
    fixtures.find((fixture) => fixture.round === 'F' && fixture.feedsInto === null) ??
    fixtures.find((fixture) => fixture.feedsInto === null);
  if (!final) {
    return { fixtures: [], byId: new Map() };
  }

  const entrySlots = collectEntrySlots(final.id, byFixtureId, feeders);
  const step = 360 / Math.max(entrySlots.length, 1);
  // Start at the top of the circle; the half-step keeps the final's axis symmetric.
  const entryAngles = new Map(entrySlots.map((key, i) => [key, -90 + (i + 0.5) * step]));
  const entryIndexes = new Map(entrySlots.map((key, i) => [key, i]));

  const fixtureAngles = new Map<string, number>();
  const angleOfFixture = (fixtureId: string): number => {
    const memoised = fixtureAngles.get(fixtureId);
    if (memoised !== undefined) {
      return memoised;
    }
    // Mark before recursing so malformed (cyclic) data cannot loop forever.
    fixtureAngles.set(fixtureId, 0);
    const angle = (angleOfSlot(fixtureId, 'home') + angleOfSlot(fixtureId, 'away')) / 2;
    fixtureAngles.set(fixtureId, angle);
    return angle;
  };
  const angleOfSlot = (fixtureId: string, slot: Slot): number => {
    const key = slotKey(fixtureId, slot);
    const feeder = feeders.get(key);
    return feeder ? angleOfFixture(feeder) : (entryAngles.get(key) ?? 0);
  };

  const layouts: FixtureLayout[] = [];
  for (const fixture of fixtures) {
    if (!fixtureAngles.has(fixture.id)) {
      angleOfFixture(fixture.id);
    }
    const angle = fixtureAngles.get(fixture.id) ?? 0;
    const radius = RING_RADIUS[fixture.round];
    const makeSlot = (slot: Slot): SlotLayout => {
      const key = slotKey(fixture.id, slot);
      const slotAngle = angleOfSlot(fixture.id, slot);
      const isEntry = !feeders.has(key);
      // Entry teams ALWAYS sit on the outer rim — one unbroken circle of nations,
      // as in the key art — even when they enter at R16 (24-team irregularity).
      // Only fed (winner) slots sit on their fixture's round ring.
      return {
        key,
        fixtureId: fixture.id,
        slot,
        teamId: slot === 'home' ? fixture.homeTeamId : fixture.awayTeamId,
        isEntry,
        angle: slotAngle,
        pos: polarToPoint(slotAngle, isEntry ? RIM_RADIUS : radius),
        entryIndex: entryIndexes.get(key),
        anchor: polarToPoint(slotAngle, radius),
      };
    };
    const nextFixture = fixture.feedsInto ? byFixtureId.get(fixture.feedsInto) : undefined;
    const winnerRadius = nextFixture ? RING_RADIUS[nextFixture.round] : 0;
    layouts.push({
      fixture,
      angle,
      radius,
      home: makeSlot('home'),
      away: makeSlot('away'),
      winnerPos: winnerRadius > 0 ? polarToPoint(angle, winnerRadius) : { x: CENTER, y: CENTER },
      winnerAngle: angle,
      winnerRadius,
      labelPos: polarToPoint(angle, radius),
    });
  }

  const byId = new Map(layouts.map((layout) => [layout.fixture.id, layout]));
  return { fixtures: layouts, byId };
}

/**
 * A team's road to the final from a given slot: the inward edge keys it would
 * travel, hop by hop, following feedsInto. Used to light a hovered team's branch.
 */
export function teamPathEdges(layout: BracketLayout, fixtureId: string, slot: Slot): Set<string> {
  const edges = new Set<string>();
  let currentId = fixtureId;
  let currentSlot: Slot = slot;
  while (layout.byId.has(currentId) && !edges.has(slotKey(currentId, currentSlot))) {
    edges.add(slotKey(currentId, currentSlot));
    const { fixture } = layout.byId.get(currentId) as FixtureLayout;
    if (!fixture.feedsInto || !fixture.feedsIntoSlot) {
      break;
    }
    currentSlot = fixture.feedsIntoSlot;
    currentId = fixture.feedsInto;
  }
  return edges;
}

export interface EdgeGeometry {
  d: string;
  /** The bend point — a junction dot in the key art; null when the edge is straight. */
  joint: Point | null;
}

/**
 * Route an edge like the key art's circuit traces: a radial stub inward from the
 * slot to the winner's ring, a junction dot at the bend, then an arc along that
 * ring to the winner slot. The arcs near the centre all sweeping into their
 * junctions is what gives the poster its collapsing-pinwheel look. The final's
 * edges (winner radius 0) and zero-span hops stay straight.
 */
export function elbowEdge(
  slot: SlotLayout,
  winnerAngle: number,
  winnerRadius: number
): EdgeGeometry {
  const start = slot.anchor;
  const end = winnerRadius > 0 ? polarToPoint(winnerAngle, winnerRadius) : { x: CENTER, y: CENTER };
  const span = winnerAngle - slot.angle;
  if (winnerRadius < 1 || Math.abs(span) < 0.5) {
    return { d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, joint: null };
  }
  const joint = polarToPoint(slot.angle, winnerRadius);
  const sweep = span > 0 ? 1 : 0; // increasing angle is clockwise on screen (y grows down)
  const largeArc = Math.abs(span) > 180 ? 1 : 0;
  return {
    d:
      `M ${start.x} ${start.y} L ${joint.x} ${joint.y} ` +
      `A ${winnerRadius} ${winnerRadius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`,
    joint,
  };
}

/**
 * The already-through hop for an entry team of an inner round: a straight
 * radial run from its rim node down to its fixture's ring (where its echo node
 * sits). Null when the team's fixture is on the rim itself.
 */
export function entryHopPath(slot: SlotLayout): string | null {
  const gap = Math.hypot(slot.pos.x - slot.anchor.x, slot.pos.y - slot.anchor.y);
  if (gap < 1) {
    return null;
  }
  return `M ${slot.pos.x} ${slot.pos.y} L ${slot.anchor.x} ${slot.anchor.y}`;
}

/** Penalties are derived, not stored: level scores with a winner (integration.md §3). */
export function wasDecidedOnPenalties(fixture: Fixture): boolean {
  return (
    fixture.status === 'finished' &&
    fixture.winnerTeamId !== null &&
    fixture.homeScore !== null &&
    fixture.homeScore === fixture.awayScore
  );
}
