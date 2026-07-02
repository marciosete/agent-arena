import { describe, expect, it } from 'vitest';
import { formatLeagueTable, type LeagueRow } from '../league';

const row = (overrides: Partial<LeagueRow>): LeagueRow => ({
  emoji: '🤖',
  name: 'Bot',
  provisioned: true,
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

  it('shows unprovisioned bots without a fabricated balance, ranked last', () => {
    const table = formatLeagueTable([
      row({ name: 'Ghost', provisioned: false }),
      row({ name: 'Sharp', balance: 9_000, pnl: -1_000 }),
    ]);
    const lines = table.split('\n');
    expect(lines[1]).toContain('Sharp');
    expect(lines[2]).toContain('Ghost');
    expect(lines[2]).toContain('(no account yet)');
    expect(lines[2]).not.toContain('$');
  });

  it('aligns columns even when an emoji carries a variation selector', () => {
    // 🛡️ is 3 UTF-16 units (VS16), 🔥 is 2 — the $ column must still line up.
    const table = formatLeagueTable([
      row({ emoji: '🛡️', name: 'Steady', balance: 5_000, pnl: -5_000 }),
      row({ emoji: '🔥', name: 'Chaser', balance: 5_000, pnl: -5_000 }),
    ]);
    const lines = table.split('\n').slice(1);
    const dollarColumns = lines.map((line) => line.replace(/\u{FE0F}/gu, '').indexOf('$'));
    expect(dollarColumns[0]).toBe(dollarColumns[1]);
  });

  it('does not mutate the caller’s row order', () => {
    const rows = [row({ name: 'A', balance: 1 }), row({ name: 'B', balance: 2 })];
    formatLeagueTable(rows);
    expect(rows[0].name).toBe('A');
  });
});
