import { describe, expect, it } from 'vitest';
import { FIXTURES, TEAMS } from '@arena/contracts';
import { teamColor, TEAM_COLORS } from './colors';

describe('teamColor (winner paths light in the winner’s colour)', () => {
  it('maps every seeded nation to a colour', () => {
    for (const team of TEAMS) {
      expect(TEAM_COLORS[team.id], team.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(teamColor('FRA')).toBe(TEAM_COLORS.FRA);
  });

  it('keeps the two sides of every seeded fixture distinguishable', () => {
    for (const fixture of FIXTURES) {
      if (fixture.homeTeamId && fixture.awayTeamId) {
        expect(teamColor(fixture.homeTeamId), fixture.id).not.toBe(teamColor(fixture.awayTeamId));
      }
    }
  });

  it('falls back to arena gold for empty slots and unknown ids', () => {
    expect(teamColor(null)).toBe('#d4af37');
    expect(teamColor('ZZZ')).toBe('#d4af37');
  });
});
