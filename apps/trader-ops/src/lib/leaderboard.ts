import { OPENING_BALANCE, type Account } from '@arena/contracts';

/** One ranked punter row for the trader-console watchlist. */
export interface LeaderboardRow {
  account: Account;
  /** 1-based standing after sorting by balance (desc), name tie-break (asc). */
  rank: number;
  /** Profit/loss versus the opening balance: `balance − openingBalance`. */
  pnl: number;
  /** Among positive-P&L punters, one of the (up to) three biggest gainers. */
  isTopWinner: boolean;
}

/** How many of the biggest positive gainers the watchlist highlights as "hot". */
const TOP_WINNER_COUNT = 3;

/**
 * Rank punters for the watchlist. Sorts by balance descending with a name
 * tie-break (`localeCompare`, ascending), assigns 1-based ranks, measures P&L
 * against `openingBalance`, and flags the up-to-three biggest positive gainers.
 *
 * Pure and non-mutating: the input array and its accounts are never touched.
 */
export function buildLeaderboard(
  accounts: readonly Account[],
  openingBalance: number = OPENING_BALANCE
): LeaderboardRow[] {
  const ordered = [...accounts].sort(
    (a, b) => b.balance - a.balance || a.name.localeCompare(b.name)
  );
  return ordered.map((account, index) => {
    const pnl = account.balance - openingBalance;
    // Sorted by balance desc means it is also sorted by P&L desc, so the biggest
    // gainers are simply the leading rows that are still in profit.
    return {
      account,
      rank: index + 1,
      pnl,
      isTopWinner: pnl > 0 && index < TOP_WINNER_COUNT,
    };
  });
}
