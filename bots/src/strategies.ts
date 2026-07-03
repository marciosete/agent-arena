import { OPENING_BALANCE, TEAMS, type Bet, type Market, type Selection } from '@arena/contracts';
import { kellyStake } from './staking';

/**
 * Betting strategies as pure functions: (markets, bankroll, history, rng) →
 * intended bets. No I/O — the bot framework fetches the inputs and places the
 * outputs. `history` is the bot's own SETTLED bets (Chaser reads its streak
 * off it); `rng` returns [0, 1) and is injected so Mug stays testable.
 */

export interface IntendedBet {
  marketId: string;
  selectionId: string;
  selectionName: string;
  stake: number;
  acceptedPrice: number;
  /** why the bot wants this bet — the logs are part of the show */
  reason: string;
}

export type Rng = () => number;

export type Strategy = (
  markets: Market[],
  bankroll: number,
  history: Bet[],
  rng: Rng
) => IntendedBet[];

interface PricedSelection {
  market: Market;
  selection: Selection;
}

export const KELLY_CAP = 0.1;
export const LONGSHOT_PRICE = 3.0;
export const MUG_STAKE = 200;
export const STEADY_FRACTION = 0.05;
export const CHASER_BASE_STAKE = 100;

/** Ignore bets under a dollar — dust stakes are noise, not a position. */
const MIN_STAKE = 1;

/** Classic Elo expectation: probability that a team rated `elo` beats `opponentElo`. */
export function eloWinProbability(elo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - elo) / 400));
}

const eloByTeamName = new Map(TEAMS.map((team) => [team.name, team.elo]));

/** Every selection on every open market, flattened and priced. */
function openSelections(markets: Market[]): PricedSelection[] {
  return markets
    .filter((market) => market.status === 'open')
    .flatMap((market) => market.selections.map((selection) => ({ market, selection })));
}

function intentFor(pick: PricedSelection, stake: number, reason: string): IntendedBet {
  return {
    marketId: pick.market.id,
    selectionId: pick.selection.id,
    selectionName: pick.selection.name,
    stake,
    acceptedPrice: pick.selection.price,
    reason,
  };
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sharp's fair prices for a match-winner market, from his own Elo book.
 * `Selection.name` == `Team.name` is the load-bearing join (integration §3);
 * a market whose selections don't both resolve to teams is not playable.
 */
function matchWinProbabilities(
  market: Market
): Array<{ selection: Selection; probability: number }> | null {
  if (market.selections.length !== 2) {
    return null;
  }
  const [home, away] = market.selections;
  const homeElo = eloByTeamName.get(home.name);
  const awayElo = eloByTeamName.get(away.name);
  if (homeElo === undefined || awayElo === undefined) {
    return null;
  }
  const homeProbability = eloWinProbability(homeElo, awayElo);
  return [
    { selection: home, probability: homeProbability },
    { selection: away, probability: 1 - homeProbability },
  ];
}

/**
 * 📐 Sharp — prices every match off his own Elo model and bets only when the
 * market's price beats his fair price, staking capped Kelly off the bankroll
 * left after the round's earlier picks.
 */
export const sharpStrategy: Strategy = (markets, bankroll, _history, _rng) => {
  const intents: IntendedBet[] = [];
  let remaining = bankroll;
  for (const market of markets) {
    if (market.status !== 'open' || market.type !== 'MATCH_WINNER') {
      continue;
    }
    const probabilities = matchWinProbabilities(market);
    if (!probabilities) {
      continue;
    }
    for (const { selection, probability } of probabilities) {
      const fairPrice = 1 / probability;
      if (selection.price <= fairPrice) {
        continue; // no edge — Sharp does not pay overround
      }
      const stake = kellyStake(probability, selection.price, remaining, KELLY_CAP);
      if (stake < MIN_STAKE) {
        continue;
      }
      remaining -= stake;
      const edge = (probability * selection.price - 1) * 100;
      intents.push(
        intentFor(
          { market, selection },
          stake,
          `my book makes ${selection.name} ${fairPrice.toFixed(2)}, market says ${selection.price.toFixed(2)} — ${edge.toFixed(1)}% edge, Kelly (10% cap) stakes $${stake}`
        )
      );
    }
  }
  return intents;
};

/**
 * 🎲 Mug — picks a random longshot (price > 3.0) and lumps $200 flat on it.
 * If the board has no longshots he punts on anything; if he can't cover the
 * stake he sits out (briefly — he'll be back).
 */
export const mugStrategy: Strategy = (markets, bankroll, _history, rng) => {
  if (bankroll < MUG_STAKE) {
    return [];
  }
  const board = openSelections(markets);
  if (board.length === 0) {
    return [];
  }
  const longshots = board.filter(({ selection }) => selection.price > LONGSHOT_PRICE);
  const pool = longshots.length > 0 ? longshots : board;
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const reason =
    longshots.length > 0
      ? `${pick.selection.name} at ${pick.selection.price.toFixed(2)}?! That's basically free money — $${MUG_STAKE} flat`
      : `no longshots on the board, so $${MUG_STAKE} on ${pick.selection.name} it is`;
  return [intentFor(pick, MUG_STAKE, reason)];
};

/**
 * 🛡️ Steady — backs the shortest price on the board every round, always a
 * flat 5% of the current bankroll.
 */
export const steadyStrategy: Strategy = (markets, bankroll, _history, _rng) => {
  const board = openSelections(markets);
  if (board.length === 0) {
    return [];
  }
  const favourite = board.reduce((best, candidate) =>
    candidate.selection.price < best.selection.price ? candidate : best
  );
  const stake = toMoney(bankroll * STEADY_FRACTION);
  if (stake < MIN_STAKE) {
    return [];
  }
  return [
    intentFor(
      favourite,
      stake,
      `${favourite.selection.name} is the shortest price on the board (${favourite.selection.price.toFixed(2)}) — steady 5% of bankroll, $${stake}`
    ),
  ];
};

/** Settled losses since the last win — the streak Chaser is chasing. */
export function consecutiveLosses(history: Bet[]): number {
  const settled = history
    .filter((bet) => (bet.status === 'won' || bet.status === 'lost') && bet.settledAt !== null)
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''));
  let streak = 0;
  for (const bet of settled) {
    if (bet.status !== 'lost') {
      break;
    }
    streak += 1;
  }
  return streak;
}

/**
 * 🔥 Chaser — martingale: doubles the stake after every loss, resets to base
 * after a win, always on the selection nearest evens. Ends badly. That's the
 * point.
 */
export const chaserStrategy: Strategy = (markets, bankroll, history, _rng) => {
  const board = openSelections(markets);
  if (board.length === 0) {
    return [];
  }
  const nearEvens = board.reduce((best, candidate) =>
    Math.abs(candidate.selection.price - 2) < Math.abs(best.selection.price - 2) ? candidate : best
  );
  const losses = consecutiveLosses(history);
  const stake = toMoney(Math.min(CHASER_BASE_STAKE * 2 ** losses, bankroll, OPENING_BALANCE));
  if (stake < MIN_STAKE) {
    return [];
  }
  const streakWord = losses === 1 ? 'loss' : 'losses';
  const reason =
    losses === 0
      ? `fresh start: base $${stake} on ${nearEvens.selection.name} near evens (${nearEvens.selection.price.toFixed(2)})`
      : `${losses} straight ${streakWord} — doubling to $${stake} on ${nearEvens.selection.name} (${nearEvens.selection.price.toFixed(2)}). It HAS to hit`;
  return [intentFor(nearEvens, stake, reason)];
};
