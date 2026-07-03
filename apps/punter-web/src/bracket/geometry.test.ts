import { describe, expect, it } from 'vitest';
import { FIXTURES, type Fixture } from '@arena/contracts';
import {
  CENTER,
  elbowEdge,
  entryHopPath,
  layoutBracket,
  polarToPoint,
  RIM_RADIUS,
  RING_RADIUS,
  teamPathEdges,
  toPercent,
  VIEW_BOX,
  wasDecidedOnPenalties,
} from './geometry';

const distanceFromCentre = (p: { x: number; y: number }): number =>
  Math.hypot(p.x - CENTER, p.y - CENTER);

describe('layoutBracket (data-driven radial layout)', () => {
  const layout = layoutBracket(FIXTURES);

  it('puts every entry team on the outer rim and every winner-slot on its round ring', () => {
    expect(layout.fixtures).toHaveLength(FIXTURES.length);
    for (const fl of layout.fixtures) {
      for (const slot of [fl.home, fl.away]) {
        // One unbroken circle of nations: even R16 direct entrants sit at the rim.
        const expected = slot.isEntry ? RIM_RADIUS : RING_RADIUS[fl.fixture.round];
        expect(distanceFromCentre(slot.pos)).toBeCloseTo(expected, 6);
      }
    }
    const r16Direct = layout.byId.get('R16-1');
    expect(distanceFromCentre(r16Direct!.home.pos)).toBeCloseTo(RIM_RADIUS, 6);
  });

  it('spreads the 24 entry slots evenly around the full circle', () => {
    const entries = layout.fixtures.flatMap((fl) =>
      [fl.home, fl.away].filter((slot) => slot.isEntry)
    );
    expect(entries).toHaveLength(24);
    const angles = entries.map((slot) => slot.angle).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(15, 6);
    }
  });

  it('links a fixture to the next round via feedsInto: its winner-slot sits on the next inner ring at the fixture angle', () => {
    const r32 = layout.byId.get('R32-9');
    expect(r32).toBeDefined();
    expect(distanceFromCentre(r32!.winnerPos)).toBeCloseTo(RING_RADIUS.R16, 6);
    // R32-9 feeds R16-5 home — the fed slot IS the feeder's winner position.
    const r16 = layout.byId.get('R16-5');
    expect(r16!.home.pos.x).toBeCloseTo(r32!.winnerPos.x, 6);
    expect(r16!.home.pos.y).toBeCloseTo(r32!.winnerPos.y, 6);
    expect(r16!.home.isEntry).toBe(false);
  });

  it('places each fixture at the mean angle of its two sides', () => {
    for (const fl of layout.fixtures) {
      expect(fl.angle).toBeCloseTo((fl.home.angle + fl.away.angle) / 2, 6);
    }
  });

  it('sends the final winner to the trophy at dead centre', () => {
    const final = layout.fixtures.find((fl) => fl.fixture.feedsInto === null);
    expect(final).toBeDefined();
    expect(final!.winnerPos).toEqual({ x: CENTER, y: CENTER });
  });

  it('reads slot occupants from the fixture data (teams enter at R32 or directly at R16)', () => {
    const r16Direct = layout.byId.get('R16-1');
    expect(r16Direct!.home.isEntry).toBe(true);
    expect(r16Direct!.home.teamId).toBe('CAN');
    // R16-5 is fed and already filled (POR won R32-9 in the live seed);
    // R16-7's feeders are still unplayed, so its slot stays open.
    expect(layout.byId.get('R16-5')!.home.teamId).toBe('POR');
    expect(layout.byId.get('R16-7')!.home.teamId).toBeNull();
  });

  it('returns an empty layout when there is no final to hang the tree from', () => {
    const headless = FIXTURES.filter((fixture) => fixture.round !== 'F');
    // Without a feedsInto: null root among these, layoutBracket still finds none of round F.
    const noRoot = headless.map((fixture) =>
      fixture.round === 'SF'
        ? { ...fixture, feedsInto: 'missing', feedsIntoSlot: 'home' as const }
        : fixture
    );
    expect(layoutBracket([]).fixtures).toHaveLength(0);
    expect(layoutBracket(noRoot).fixtures).toHaveLength(0);
  });
});

describe('polarToPoint', () => {
  it('converts polar to cartesian around the centre', () => {
    expect(polarToPoint(0, 100)).toEqual({ x: CENTER + 100, y: CENTER });
    const top = polarToPoint(-90, 100);
    expect(top.x).toBeCloseTo(CENTER, 6);
    expect(top.y).toBeCloseTo(CENTER - 100, 6);
  });
});

describe('entry anchors & already-through hops (every level stays visible)', () => {
  const layout = layoutBracket(FIXTURES);

  it('an inner-round entry keeps its node on the rim but anchors its edge on its own ring', () => {
    const r16Direct = layout.byId.get('R16-1')!; // CAN, pre-placed in R16 (won its real R32 game)
    expect(distanceFromCentre(r16Direct.home.pos)).toBeCloseTo(RIM_RADIUS, 6);
    expect(distanceFromCentre(r16Direct.home.anchor)).toBeCloseTo(RING_RADIUS.R16, 6);
    expect(entryHopPath(r16Direct.home)).toContain('M ');
  });

  it('rim entries and fed slots have no hop (anchor === pos)', () => {
    const r32 = layout.byId.get('R32-9')!;
    expect(r32.home.anchor).toEqual(r32.home.pos);
    expect(entryHopPath(r32.home)).toBeNull();
    const fed = layout.byId.get('R16-5')!;
    expect(fed.home.anchor).toEqual(fed.home.pos);
    expect(entryHopPath(fed.home)).toBeNull();
  });

  it('the fixture edge starts from the anchor, so the hop and the edge chain up', () => {
    const r16Direct = layout.byId.get('R16-1')!;
    const { d } = elbowEdge(r16Direct.home, r16Direct.winnerAngle, r16Direct.winnerRadius);
    expect(d.startsWith(`M ${r16Direct.home.anchor.x} ${r16Direct.home.anchor.y}`)).toBe(true);
  });
});

describe('elbowEdge (key-art circuit traces)', () => {
  const layout = layoutBracket(FIXTURES);

  it('routes a radial stub to the winner ring, bends at a junction, then arcs to the winner slot', () => {
    const r32 = layout.byId.get('R32-9')!;
    const { d, joint } = elbowEdge(r32.home, r32.winnerAngle, r32.winnerRadius);
    // The joint sits at the slot's own angle on the winner's ring.
    const expected = polarToPoint(r32.home.angle, r32.winnerRadius);
    expect(joint).not.toBeNull();
    expect(joint!.x).toBeCloseTo(expected.x, 6);
    expect(joint!.y).toBeCloseTo(expected.y, 6);
    expect(d).toContain(`A ${r32.winnerRadius} ${r32.winnerRadius}`);
    // The arc sweeps toward the fixture's mean angle and lands on the winner slot.
    expect(d.startsWith(`M ${r32.home.pos.x} ${r32.home.pos.y}`)).toBe(true);
    expect(d.endsWith(`${r32.winnerPos.x} ${r32.winnerPos.y}`)).toBe(true);
  });

  it('sweeps clockwise or anticlockwise toward the junction, per side', () => {
    const r32 = layout.byId.get('R32-9')!;
    const home = elbowEdge(r32.home, r32.winnerAngle, r32.winnerRadius).d;
    const away = elbowEdge(r32.away, r32.winnerAngle, r32.winnerRadius).d;
    const sweepOf = (d: string): string => d.split(' ').at(-3) as string;
    expect(new Set([sweepOf(home), sweepOf(away)])).toEqual(new Set(['0', '1']));
  });

  it('keeps the final’s edges straight into the trophy (no joint at radius 0)', () => {
    const final = layout.fixtures.find((fl) => fl.fixture.feedsInto === null)!;
    const { d, joint } = elbowEdge(final.home, final.winnerAngle, final.winnerRadius);
    expect(joint).toBeNull();
    expect(d).not.toContain('A');
    expect(d.endsWith(`L ${CENTER} ${CENTER}`)).toBe(true);
  });
});

describe('padded viewBox', () => {
  it('keeps the trophy at the centre of the padded box and maps coordinates to %', () => {
    expect(VIEW_BOX).toBe('-64 -64 1128 1128');
    expect(toPercent(CENTER)).toBeCloseTo(50, 6);
    expect(toPercent(-64)).toBe(0);
    expect(toPercent(1064)).toBe(100);
  });
});

describe('teamPathEdges (a team’s road to the final)', () => {
  const layout = layoutBracket(FIXTURES);

  it('follows feedsInto hop by hop to the final', () => {
    const path = teamPathEdges(layout, 'R32-9', 'home');
    expect([...path]).toEqual(['R32-9:home', 'R16-5:home', 'QF-3:home', 'SF-2:home', 'F-1:away']);
  });

  it('stops safely on malformed chains instead of looping', () => {
    const final = FIXTURES.find((fixture) => fixture.round === 'F') as Fixture;
    const cyclic: Fixture[] = [
      final,
      {
        id: 'X',
        round: 'SF',
        kickoff: '2026-07-10T20:00:00Z',
        homeTeamId: 'FRA',
        awayTeamId: 'BRA',
        feedsInto: 'X', // malformed: feeds itself
        feedsIntoSlot: 'home',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      },
    ];
    const path = teamPathEdges(layoutBracket(cyclic), 'X', 'home');
    expect(path.size).toBe(1);
  });
});

describe('wasDecidedOnPenalties (derived, not stored)', () => {
  const base = FIXTURES[0];

  it('is true for a finished, level-score fixture with a winner', () => {
    expect(
      wasDecidedOnPenalties({
        ...base,
        status: 'finished',
        homeScore: 1,
        awayScore: 1,
        winnerTeamId: 'POR',
      })
    ).toBe(true);
  });

  it('is false for a regulation win or an unfinished fixture', () => {
    expect(
      wasDecidedOnPenalties({
        ...base,
        status: 'finished',
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: 'POR',
      })
    ).toBe(false);
    expect(wasDecidedOnPenalties({ ...base, status: 'scheduled' })).toBe(false);
  });
});
