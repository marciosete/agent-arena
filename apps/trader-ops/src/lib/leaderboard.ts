import { OPENING_BALANCE, type Account } from '@arena/contracts';

/** An account placed on the watchlist: its rank, P&L vs the opening balance, and a hot flag. */
export interface RankedAccount {
  account: Account;
  rank: number;
  pnl: number;
  hot: boolean;
}

/** Only the podium can run hot — and only while actually up on the day. */
const HOT_RANK_LIMIT = 3;

/**
 * Rank accounts for the punter watchlist (doubles as the bot leaderboard during
 * the finale): richest first, ties broken by name so the order stays stable
 * across polls. Each row carries P&L against the shared opening balance every
 * account starts with, and a "hot" flag for the biggest winners — top three AND
 * genuinely up (a loser is never hot, even sitting in the top three).
 */
export function rankAccounts(accounts: Account[]): RankedAccount[] {
  return [...accounts]
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
    .map((account, index) => {
      const rank = index + 1;
      const pnl = account.balance - OPENING_BALANCE;
      return { account, rank, pnl, hot: rank <= HOT_RANK_LIMIT && pnl > 0 };
    });
}
