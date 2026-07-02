import { describe, expect, it } from 'vitest';
import { TEAMS } from '@arena/contracts';
import { GOLD, TEAM_ACCENT, accentFor } from './teamAccents';

describe('team accents', () => {
  it('maps every seeded team to an accent', () => {
    for (const team of TEAMS) {
      expect(TEAM_ACCENT[team.id], team.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('falls back to gold for unknown or empty slots', () => {
    expect(accentFor('POR')).toBe(TEAM_ACCENT.POR);
    expect(accentFor('ZZZ')).toBe(GOLD);
    expect(accentFor(null)).toBe(GOLD);
  });
});
