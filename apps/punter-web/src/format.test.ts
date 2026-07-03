import { describe, expect, it } from 'vitest';
import type { Bet } from '@arena/contracts';
import {
  betReturn,
  formatDonuts,
  formatKickoff,
  formatPrice,
  teamFlag,
  teamName,
  teamShortName,
} from './format';

describe('team lookups', () => {
  it('resolves names and flags from the contract seed', () => {
    expect(teamName('POR')).toBe('Portugal');
    expect(teamFlag('POR')).toBe('🇵🇹');
  });

  it('handles empty slots and unknown ids gracefully', () => {
    expect(teamName(null)).toBe('TBD');
    expect(teamFlag(null)).toBe('·');
    expect(teamName('ZZZ')).toBe('ZZZ');
    expect(teamFlag('ZZZ')).toBe('🏳️');
    expect(teamShortName(null)).toBe('');
  });

  it('resolves the prologue nations the contract seed dropped', () => {
    expect(teamName('JPN')).toBe('Japan');
    expect(teamFlag('JPN')).toBe('🇯🇵');
    expect(teamShortName('RSA')).toBe('South Africa'); // exactly 12 chars — fits the rim
    expect(teamShortName('CIV')).toBe('Ivory Coast');
  });

  it('shortens long names to the 3-letter id for rim labels', () => {
    expect(teamShortName('POR')).toBe('Portugal');
    expect(teamShortName('BIH')).toBe('BIH'); // Bosnia and Herzegovina
    expect(teamShortName('USA')).toBe('USA'); // United States (13 chars)
    expect(teamShortName('ZZZ')).toBe('ZZZ'); // unknown id passes through
  });
});

describe('money and odds', () => {
  it('formats donut dollars with separators and at most 2 decimals', () => {
    expect(formatDonuts(10_000)).toBe('🍩 10,000');
    expect(formatDonuts(9_814.5)).toBe('🍩 9,814.5');
    expect(formatDonuts(185.375)).toBe('🍩 185.38');
  });

  it('formats decimal odds to two places', () => {
    expect(formatPrice(1.8)).toBe('1.80');
    expect(formatPrice(12)).toBe('12.00');
  });
});

describe('formatKickoff', () => {
  it('renders a readable local date and blanks invalid input', () => {
    expect(formatKickoff('2026-07-02T17:00:00Z')).not.toBe('');
    expect(formatKickoff('not-a-date')).toBe('');
  });
});

describe('betReturn', () => {
  const bet = { stake: 100, potentialReturn: 185 } as Bet;

  it('pays the locked return unless the bet lost', () => {
    expect(betReturn({ ...bet, status: 'pending' } as Bet)).toBe(185);
    expect(betReturn({ ...bet, status: 'won' } as Bet)).toBe(185);
    expect(betReturn({ ...bet, status: 'lost' } as Bet)).toBe(0);
  });

  it('refunds exactly the stake on a void bet', () => {
    expect(betReturn({ ...bet, status: 'void' } as Bet)).toBe(100);
  });
});
