import { describe, expect, it } from 'vitest';
import { FIXTURES, type Fixture } from '@arena/contracts';
import {
  CENTER,
  RING_RADIUS,
  decidedOnPenalties,
  edgePath,
  eliminatedTeamIds,
  layoutBracket,
  loserTeamId,
  polarPoint,
  teamPathFixtureIds,
} from './geometry';

function fixture(id: string, patch: Partial<Fixture> = {}): Fixture {
  const base = FIXTURES.find((candidate) => candidate.id === id);
  if (!base) {
    throw new Error(`unknown fixture ${id}`);
  }
  return { ...base, ...patch };
}

describe('layoutBracket on the real seed', () => {
  const layout = layoutBracket(FIXTURES);

  it('lays out every fixture and counts 24 entry teams', () => {
    expect(layout.fixtures).toHaveLength(FIXTURES.length);
    expect(layout.leafCount).toBe(24);
  });

  it('puts each round on its ring, converging inward', () => {
    expect(layout.byId.get('R32-9')?.home.radius).toBe(RING_RADIUS.R32);
    expect(layout.byId.get('R16-1')?.home.radius).toBe(RING_RADIUS.R16);
    expect(layout.byId.get('QF-2')?.away.radius).toBe(RING_RADIUS.QF);
    expect(layout.byId.get('SF-1')?.home.radius).toBe(RING_RADIUS.SF);
    expect(layout.byId.get('F-1')?.home.radius).toBe(RING_RADIUS.F);
    expect(layout.byId.get('F-1')?.winnerRadius).toBe(0);
  });

  it('sits a winner-slot at the mean angle of its feeders (linked by feedsInto)', () => {
    const r32 = layout.byId.get('R32-9');
    const r16 = layout.byId.get('R16-5');
    expect(r16?.home.fedBy).toBe('R32-9');
    expect(r16?.home.angle).toBeCloseTo(r32?.midAngle ?? Number.NaN, 10);
    expect(r32?.winnerPoint.x).toBeCloseTo(r16?.home.point.x ?? Number.NaN, 10);
    expect(r32?.winnerPoint.y).toBeCloseTo(r16?.home.point.y ?? Number.NaN, 10);
  });

  it('marks slots nobody feeds as entry slots with their seeded teams', () => {
    const r16 = layout.byId.get('R16-1');
    expect(r16?.home.fedBy).toBeNull();
    expect(r16?.home.teamId).toBe('CAN');
    expect(r16?.away.teamId).toBe('MAR');
  });

  it('spreads entry teams around the full circle without collisions', () => {
    const entryAngles = layout.fixtures
      .flatMap((entry) => [entry.home, entry.away])
      .filter((slot) => slot.fedBy === null)
      .map((slot) => slot.angle)
      .sort((a, b) => a - b);
    expect(entryAngles).toHaveLength(24);
    for (let i = 1; i < entryAngles.length; i += 1) {
      expect(entryAngles[i] - entryAngles[i - 1]).toBeCloseTo((2 * Math.PI) / 24, 10);
    }
  });

  it('routes the final into the trophy at dead centre', () => {
    const final = layout.byId.get('F-1');
    expect(final?.winnerPoint.x).toBeCloseTo(CENTER, 10);
    expect(final?.winnerPoint.y).toBeCloseTo(CENTER, 10);
  });

  it('reflects live winners propagated into next-round slots', () => {
    const live = FIXTURES.map((entry) =>
      entry.id === 'R16-5' ? { ...entry, homeTeamId: 'POR' } : entry
    );
    const liveLayout = layoutBracket(live);
    expect(liveLayout.byId.get('R16-5')?.home.teamId).toBe('POR');
    expect(liveLayout.byId.get('R16-5')?.home.fedBy).toBe('R32-9');
  });

  it('returns an empty layout for an empty fixture list', () => {
    const empty = layoutBracket([]);
    expect(empty.fixtures).toHaveLength(0);
    expect(empty.leafCount).toBe(0);
  });
});

describe('edgePath', () => {
  it('collapses to a straight radial line when the angles align', () => {
    const path = edgePath(0, 460, 0, 360);
    expect(path).toBe('M 960.00 500.00 L 860.00 500.00');
  });

  it('bends through a waypoint arc when the angles differ', () => {
    const path = edgePath(0, 460, Math.PI / 4, 360);
    expect(path).toContain('A');
    expect(path.startsWith('M 960.00 500.00 L')).toBe(true);
    const sweep = path.split('A')[1].trim().split(' ')[4];
    expect(sweep).toBe('1');
  });

  it('sweeps the other way for a counter-clockwise bend', () => {
    const path = edgePath(0, 460, -Math.PI / 4, 360);
    const sweep = path.split('A')[1].trim().split(' ')[4];
    expect(sweep).toBe('0');
  });
});

describe('derived live state', () => {
  const decided = fixture('R32-9', {
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: 'POR',
  });
  const onPens = fixture('R32-10', {
    status: 'finished',
    homeScore: 1,
    awayScore: 1,
    winnerTeamId: 'ESP',
  });

  it('collects eliminated teams from finished fixtures', () => {
    const out = eliminatedTeamIds([decided, onPens, fixture('R32-11')]);
    expect(out).toEqual(new Set(['CRO', 'AUT']));
  });

  it('names the loser of a finished fixture, in either slot', () => {
    expect(loserTeamId(decided)).toBe('CRO');
    expect(loserTeamId(fixture('R32-9', { ...decided, winnerTeamId: 'CRO' }))).toBe('POR');
    expect(loserTeamId(fixture('R32-11'))).toBeNull();
  });

  it('derives penalties exactly as integration.md prescribes', () => {
    expect(decidedOnPenalties(onPens)).toBe(true);
    expect(decidedOnPenalties(decided)).toBe(false);
    expect(decidedOnPenalties(fixture('R32-11'))).toBe(false);
  });

  it("walks a team's road to the final via feedsInto", () => {
    expect(teamPathFixtureIds(FIXTURES, 'POR')).toEqual(['R32-9', 'R16-5', 'QF-3', 'SF-2', 'F-1']);
    expect(teamPathFixtureIds(FIXTURES, 'CAN')).toEqual(['R16-1', 'QF-1', 'SF-1', 'F-1']);
    expect(teamPathFixtureIds(FIXTURES, 'ZZZ')).toEqual([]);
  });

  it('starts the road from the outermost appearance once winners propagate', () => {
    const live = FIXTURES.map((entry) =>
      entry.id === 'R16-5' ? { ...entry, homeTeamId: 'POR' } : entry
    );
    expect(teamPathFixtureIds(live, 'POR')).toEqual(['R32-9', 'R16-5', 'QF-3', 'SF-2', 'F-1']);
  });
});

describe('polarPoint', () => {
  it('converts polar to cartesian around the centre', () => {
    expect(polarPoint(0, 100)).toEqual({ x: 600, y: 500 });
    const top = polarPoint(-Math.PI / 2, 100);
    expect(top.x).toBeCloseTo(500, 10);
    expect(top.y).toBeCloseTo(400, 10);
  });
});
