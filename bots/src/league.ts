/** One row per bot in the printed league table. */
export interface LeagueRow {
  emoji: string;
  name: string;
  balance: number;
  openBets: number;
  pnl: number;
}

function money(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedMoney(value: number): string {
  return `${value < 0 ? '-' : '+'}$${money(Math.abs(value))}`;
}

/** Rich-kid leaderboard: sorted by balance, P&L vs the opening bankroll. */
export function formatLeagueTable(rows: LeagueRow[]): string {
  const sorted = [...rows].sort((a, b) => b.balance - a.balance);
  const lines = sorted.map((row, index) => {
    const label = `${row.emoji} ${row.name}`.padEnd(12);
    const balance = `$${money(row.balance)}`.padStart(12);
    const open = `${row.openBets} open`.padStart(8);
    return ` ${index + 1}. ${label} ${balance} ${open}  ${signedMoney(row.pnl)}`;
  });
  return ['🏟️  League table', ...lines].join('\n');
}
