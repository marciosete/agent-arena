import { OPENING_BALANCE } from '@arena/contracts';

/** One bot's line in the league table. */
export interface StandingRow {
  emoji: string;
  name: string;
  balance: number;
  openBets: number;
}

export function profitAndLoss(balance: number): number {
  return Math.round((balance - OPENING_BALANCE) * 100) / 100;
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedMoney(value: number): string {
  return `${value < 0 ? '-' : '+'}${money(Math.abs(value))}`;
}

/**
 * Terminal column width, not string length: emoji (astral glyphs) render two
 * cells and variation selectors render none — String.padEnd counts both as
 * code units and misaligns any row whose emoji carries a VS16 (🛡️).
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const glyph of text) {
    if (glyph === '\uFE0F') {
      continue;
    }
    width += (glyph.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  }
  return width;
}

function padDisplay(text: string, target: number): string {
  return text + ' '.repeat(Math.max(0, target - displayWidth(text)));
}

/** Render the standings, richest bot first. */
export function renderLeagueTable(rows: StandingRow[]): string {
  const standings = [...rows].sort((a, b) => b.balance - a.balance);
  const header = [
    '#'.padStart(2),
    padDisplay('bot', 14),
    'balance'.padStart(12),
    'open'.padStart(5),
    'P&L'.padStart(12),
  ].join('  ');
  const lines = standings.map((row, index) =>
    [
      String(index + 1).padStart(2),
      padDisplay(`${row.emoji} ${row.name}`, 14),
      money(row.balance).padStart(12),
      String(row.openBets).padStart(5),
      signedMoney(profitAndLoss(row.balance)).padStart(12),
    ].join('  ')
  );
  return ['🏆 League table', header, ...lines].join('\n');
}
