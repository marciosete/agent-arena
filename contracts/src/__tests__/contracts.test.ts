import { describe, expect, it } from 'vitest';
import { FIXTURES, PORTS, TEAMS, fixtureById, teamById } from '../index';

describe('seed data integrity', () => {
  it('loads and validates all teams', () => {
    expect(TEAMS.length).toBe(24);
  });

  it('loads and validates all fixtures', () => {
    // 8 R32 + 8 R16 + 4 QF + 2 SF + 1 final
    expect(FIXTURES.length).toBe(23);
  });

  it('has unique team ids', () => {
    const ids = TEAMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique fixture ids', () => {
    const ids = FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only known teams in fixtures', () => {
    for (const fixture of FIXTURES) {
      for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
        if (teamId !== null) {
          expect(teamById(teamId), `${fixture.id} references unknown team ${teamId}`).toBeDefined();
        }
      }
    }
  });

  it('links every non-final fixture into a valid next fixture', () => {
    for (const fixture of FIXTURES) {
      if (fixture.round === 'F') {
        expect(fixture.feedsInto).toBeNull();
        expect(fixture.feedsIntoSlot).toBeNull();
      } else {
        expect(fixture.feedsInto).not.toBeNull();
        expect(fixture.feedsIntoSlot).not.toBeNull();
        expect(
          fixtureById(fixture.feedsInto as string),
          `${fixture.id} feeds into unknown fixture ${fixture.feedsInto}`
        ).toBeDefined();
      }
    }
  });

  it('fills each bracket slot exactly once', () => {
    const slots = FIXTURES.filter((f) => f.feedsInto !== null).map(
      (f) => `${f.feedsInto}:${f.feedsIntoSlot}`
    );
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('assigns a unique port to every process', () => {
    const ports = Object.values(PORTS);
    expect(new Set(ports).size).toBe(ports.length);
  });
});
