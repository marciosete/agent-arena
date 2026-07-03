import { describe, expect, it } from 'vitest';
import { fmtClock, fmtMoney, fmtOdds, fmtPct, fmtSignedMoney } from './format';

describe('format', () => {
  it('formats money with thousands separators and at most 2 decimals', () => {
    expect(fmtMoney(10_000)).toBe('10,000');
    expect(fmtMoney(1234.567)).toBe('1,234.57');
    expect(fmtMoney(0)).toBe('0');
  });

  it('signs P&L values', () => {
    expect(fmtSignedMoney(2_500)).toBe('+2,500');
    expect(fmtSignedMoney(-1_250.5)).toBe('-1,250.5');
    expect(fmtSignedMoney(0)).toBe('0');
  });

  it('renders odds to two decimals', () => {
    expect(fmtOdds(2.5)).toBe('2.50');
    expect(fmtOdds(1.015)).toBe('1.01');
  });

  it('renders probabilities as percentages', () => {
    expect(fmtPct(0.415)).toBe('41.5%');
    expect(fmtPct(1)).toBe('100.0%');
  });

  it('renders a 24h wall clock', () => {
    expect(fmtClock(new Date(2026, 6, 3, 9, 5, 7).getTime())).toBe('09:05:07');
  });
});
