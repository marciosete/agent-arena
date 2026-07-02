/** One row per bot in the printed league table. */
export interface LeagueRow {
  emoji: string;
  name: string;
  /** false until the bot has an account — no balance to show yet */
  provisioned: boolean;
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

/**
 * Pad by visible code points, not UTF-16 units: 🛡️ carries a variation
 * selector that padEnd would count, skewing every column after it.
 */
function padLabel(label: string, width: number): string {
  const visible = [...label.replace(/️/gu, '')].length;
  return label + ' '.repeat(Math.max(0, width - visible));
}

/**
 * Rich-kid leaderboard: provisioned bots sorted by balance with P&L vs the
 * opening bankroll; bots still waiting on an account sit at the bottom
 * without a fabricated balance.
 */
export function formatLeagueTable(rows: LeagueRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    if (a.provisioned !== b.provisioned) return Number(b.provisioned) - Number(a.provisioned);
    return b.balance - a.balance;
  });
  const lines = sorted.map((row, index) => {
    const label = padLabel(`${row.emoji} ${row.name}`, 12);
    if (!row.provisioned) {
      return ` ${index + 1}. ${label} (no account yet)`;
    }
    const balance = `$${money(row.balance)}`.padStart(12);
    const open = `${row.openBets} open`.padStart(8);
    return ` ${index + 1}. ${label} ${balance} ${open}  ${signedMoney(row.pnl)}`;
  });
  return ['🏟️  League table', ...lines].join('\n');
}
