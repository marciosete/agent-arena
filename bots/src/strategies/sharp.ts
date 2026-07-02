import { TEAMS } from '@arena/contracts';
import { eloWinProbability } from '../elo';
import { kellyStake } from '../staking';
import { affordableStake, biddableMarkets, intend, type PricedSelection } from './shared';
import type { IntendedBet, Strategy } from './types';

/** Never risk more than 10% of the bankroll on one price, however juicy. */
export const SHARP_KELLY_CAP = 0.1;

/**
 * Sharp's own curve is steeper than the bookmaker's textbook 400: he
 * believes class tells more than the market does. That disagreement is
 * where his edges come from — a same-model bettor would never beat the
 * overround.
 */
export const SHARP_ELO_DIVISOR = 250;

/** TEAMS is frozen seed data — build the name → elo join once, not per round. */
const ELO_BY_NAME = new Map(TEAMS.map((team) => [team.name, team.elo]));

interface Edge {
  pick: PricedSelection;
  probability: number;
  edge: number;
}

/**
 * 📐 Sharp — runs his own Elo book over TEAMS and only bets when the market
 * price beats his fair price. Selections join to teams by name (the
 * load-bearing convention from integration.md §3); Kelly staking, capped.
 */
export const sharp: Strategy = (markets, bankroll, history) => {
  let best: Edge | null = null;

  for (const market of biddableMarkets(markets, history)) {
    if (market.type !== 'MATCH_WINNER' || market.selections.length !== 2) continue;
    const [home, away] = market.selections;
    const homeElo = ELO_BY_NAME.get(home.name);
    const awayElo = ELO_BY_NAME.get(away.name);
    if (homeElo === undefined || awayElo === undefined) continue;

    const sides = [
      { selection: home, probability: eloWinProbability(homeElo, awayElo, SHARP_ELO_DIVISOR) },
      { selection: away, probability: eloWinProbability(awayElo, homeElo, SHARP_ELO_DIVISOR) },
    ];
    for (const { selection, probability } of sides) {
      const edge = probability * selection.price - 1;
      if (edge <= 0) continue; // market price does not beat the fair price
      if (!best || edge > best.edge) {
        best = { pick: { market, selection }, probability, edge };
      }
    }
  }

  if (!best) return [];
  const stake = affordableStake(
    kellyStake(best.probability, best.pick.selection.price, bankroll, SHARP_KELLY_CAP),
    bankroll
  );
  if (stake === 0) return [];
  return [buildIntent(best, stake)];
};

function buildIntent(best: Edge, stake: number): IntendedBet {
  const fair = (1 / best.probability).toFixed(2);
  const reason =
    `my Elo book makes ${best.pick.selection.name} ${fair} fair; ` +
    `market says ${best.pick.selection.price} — ${(best.edge * 100).toFixed(1)}% edge, Kelly sized`;
  return intend(best.pick, stake, reason);
}
