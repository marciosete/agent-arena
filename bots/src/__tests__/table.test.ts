import { describe, expect, it } from 'vitest';
import { displayWidth, profitAndLoss, renderLeagueTable } from '../table';

describe('displayWidth', () => {
  it('counts emoji as two columns and variation selectors as none', () => {
    expect(displayWidth('🛡️')).toBe(2); // shield + VS16
    expect(displayWidth('🔥')).toBe(2);
    expect(displayWidth('abc')).toBe(3);
  });
});

describe('profitAndLoss', () => {
  it('is the distance from the opening balance, rounded to cents', () => {
    expect(profitAndLoss(12_345.5)).toBe(2_345.5);
    expect(profitAndLoss(9_800)).toBe(-200);
    expect(profitAndLoss(10_000)).toBe(0);
  });
});

describe('renderLeagueTable', () => {
  const rows = [
    { emoji: '🎲', name: 'Mug', balance: 9_800, openBets: 3 },
    { emoji: '📐', name: 'Sharp', balance: 12_345.5, openBets: 1 },
  ];

  it('ranks the richest bot first', () => {
    const lines = renderLeagueTable(rows).split('\n');
    expect(lines[0]).toContain('League table');
    expect(lines[2]).toContain('Sharp');
    expect(lines[3]).toContain('Mug');
  });

  it('shows balance, open bet count and signed P&L per bot', () => {
    const table = renderLeagueTable(rows);
    expect(table).toContain('$12,345.50');
    expect(table).toContain('+$2,345.50');
    expect(table).toContain('-$200.00');
    expect(table).toMatch(/Mug.*3/);
  });

  it('leaves the input order untouched', () => {
    renderLeagueTable(rows);
    expect(rows[0].name).toBe('Mug');
  });

  it('aligns rows even when an emoji carries a variation selector', () => {
    const table = renderLeagueTable([
      { emoji: '🛡️', name: 'Steady', balance: 10_000, openBets: 0 },
      { emoji: '🔥', name: 'Chaser', balance: 9_000, openBets: 0 },
    ]);
    const [, , steadyLine, chaserLine] = table.split('\n');
    expect(steadyLine).toContain('Steady');
    expect(displayWidth(steadyLine)).toBe(displayWidth(chaserLine));
  });
});
