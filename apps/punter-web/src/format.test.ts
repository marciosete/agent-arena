import { describe, expect, it } from 'vitest';
import { formatDonuts, formatKickoff, formatPrice } from './format';
import { flagForSelection, teamForSelection } from './teams';

describe('formatting', () => {
  it('prints decimal odds with two places', () => {
    expect(formatPrice(1.8)).toBe('1.80');
    expect(formatPrice(12)).toBe('12.00');
  });

  it('prints donut dollars with separators, keeping fractional stakes', () => {
    expect(formatDonuts(10_000)).toBe('🍩 10,000');
    expect(formatDonuts(99.5)).toBe('🍩 99.5');
  });

  it('prints kickoffs short and falls back to TBC on garbage', () => {
    expect(formatKickoff('2026-07-04T17:00:00Z')).toMatch(/Jul/);
    expect(formatKickoff('not-a-date')).toBe('TBC');
  });
});

describe('selection → team join (by name, per integration.md §3)', () => {
  it('resolves a selection to its team by exact name', () => {
    expect(teamForSelection({ name: 'Portugal' })?.id).toBe('POR');
    expect(flagForSelection({ name: 'Portugal' })).toBe('🇵🇹');
  });

  it('falls back to a neutral ball for unknown names', () => {
    expect(teamForSelection({ name: 'Narnia' })).toBeUndefined();
    expect(flagForSelection({ name: 'Narnia' })).toBe('⚽');
  });
});
