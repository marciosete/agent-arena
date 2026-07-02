import { describe, expect, it } from 'vitest';
import { formatLeagueTable, type LeagueRow } from '../league';

const row = (overrides: Partial<LeagueRow>): LeagueRow => ({
  emoji: '🤖',
  name: 'Bot',
  balance: 10_000,
  openBets: 0,
  pnl: 0,
  ...overrides,
});

describe('formatLeagueTable', () => {
  it('ranks bots by balance with open bets and signed P&L', () => {
    const table = formatLeagueTable([
      row({ name: 'Chaser', balance: 3_200, pnl: -6_800, openBets: 1 }),
      row({ name: 'Sharp', balance: 12_400.5, pnl: 2_400.5, openBets: 3 }),
      row({ name: 'Steady', balance: 10_000, pnl: 0 }),
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toContain('League table');
    expect(lines[1]).toContain('1. 🤖 Sharp');
    expect(lines[1]).toContain('$12,400.50');
    expect(lines[1]).toContain('3 open');
    expect(lines[1]).toContain('+$2,400.50');
    expect(lines[2]).toContain('2. 🤖 Steady');
    expect(lines[2]).toContain('+$0.00');
    expect(lines[3]).toContain('3. 🤖 Chaser');
    expect(lines[3]).toContain('-$6,800.00');
  });

  it('does not mutate the caller’s row order', () => {
    const rows = [row({ name: 'A', balance: 1 }), row({ name: 'B', balance: 2 })];
    formatLeagueTable(rows);
    expect(rows[0].name).toBe('A');
  });
});
