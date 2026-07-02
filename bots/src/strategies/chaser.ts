import type { Bet } from '@arena/contracts';
import { affordableStake, allSelections, biddableMarkets, intend } from './shared';
import type { Strategy } from './types';

export const CHASER_BASE_STAKE = 100;
/** Martingale wants coin-flips: hunt the price closest to evens. */
const EVENS = 2;

/** Consecutive losses since the last win, most recent settlement first. */
export function lossStreak(history: Bet[]): number {
  const settled = history
    .filter((bet) => bet.status === 'won' || bet.status === 'lost')
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? ''));
  let streak = 0;
  for (let i = settled.length - 1; i >= 0 && settled[i].status === 'lost'; i -= 1) {
    streak += 1;
  }
  return streak;
}

/**
 * 🔥 Chaser — martingale. Doubles the stake after every loss, resets on a win,
 * and goes all-in when the double outgrows the bankroll. Ends badly; that is
 * the point.
 */
export const chaser: Strategy = (markets, bankroll, history) => {
  const options = allSelections(biddableMarkets(markets, history));
  if (options.length === 0) return [];
  const nearEvens = options.reduce((closest, candidate) =>
    Math.abs(candidate.selection.price - EVENS) < Math.abs(closest.selection.price - EVENS)
      ? candidate
      : closest
  );
  const streak = lossStreak(history);
  const stake = affordableStake(CHASER_BASE_STAKE * 2 ** streak, bankroll);
  if (stake === 0) return [];
  const reason =
    streak === 0
      ? `fresh slate — $${stake} on ${nearEvens.selection.name} near evens`
      : `${streak} down in a row… doubling to $${stake} on ${nearEvens.selection.name}, it HAS to come in`;
  return [intend(nearEvens, stake, reason)];
};
