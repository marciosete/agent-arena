import { describe, expect, it } from 'vitest';
import { formatBalance, formatClock, formatMoney, formatPrice, formatSigned } from './format';

describe('formatMoney', () => {
  it('rounds and separates thousands', () => {
    expect(formatMoney(12345.6)).toBe('12,346');
    expect(formatMoney(0)).toBe('0');
  });
});

describe('formatSigned', () => {
  it('prefixes gains with a plus', () => {
    expect(formatSigned(1200)).toBe('+1,200');
  });

  it('keeps the minus on losses and shows zero flat', () => {
    expect(formatSigned(-450)).toBe('-450');
    expect(formatSigned(0)).toBe('0');
  });
});

describe('formatBalance', () => {
  it('keeps cents exactly instead of rounding a fractional balance', () => {
    expect(formatBalance(10_000.75)).toBe('10,000.75');
  });

  it('shows no decimals for a whole balance', () => {
    expect(formatBalance(10_000)).toBe('10,000');
  });
});

describe('formatPrice', () => {
  it('always shows two decimal places', () => {
    expect(formatPrice(2)).toBe('2.00');
    expect(formatPrice(3.456)).toBe('3.46');
  });
});

describe('formatClock', () => {
  it('renders an ISO timestamp as HH:MM:SS', () => {
    expect(formatClock('2026-07-03T12:34:56.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('renders an em dash for garbage input', () => {
    expect(formatClock('not-a-date')).toBe('—');
  });
});
