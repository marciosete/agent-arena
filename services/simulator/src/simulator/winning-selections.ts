import { teamById, type Market, type SettlementEvent } from '@arena/contracts';

export interface WinningSelection {
  marketId: string;
  selectionId: string;
}

/**
 * The §3 join (docs/engineering/integration.md): `winnerTeamId` → `Team.name`
 * → the `Selection` whose `name` matches, read from PRICING'S OWN /reprice
 * response. Pricing owns selection ids — they are resolved by team name from
 * the returned `Market[]`, never derived from a guessed id format.
 *
 * For the just-settled MATCH_WINNER market (`fixtureId === settlement.fixtureId`)
 * this yields one winning selection; when the final was played it also yields
 * the OUTRIGHT market's selection for the champion (= the final's winner).
 */
export function resolveWinningSelections(
  markets: readonly Market[],
  settlement: SettlementEvent,
  finalPlayed: boolean
): WinningSelection[] {
  const winnerName = teamById(settlement.winnerTeamId)?.name;
  if (!winnerName) {
    return [];
  }

  const winners: WinningSelection[] = [];

  const matchMarket = markets.find(
    (market) => market.type === 'MATCH_WINNER' && market.fixtureId === settlement.fixtureId
  );
  const matchSelection = matchMarket?.selections.find((s) => s.name === winnerName);
  if (matchMarket && matchSelection) {
    winners.push({ marketId: matchMarket.id, selectionId: matchSelection.id });
  }

  if (finalPlayed) {
    const outright = markets.find((market) => market.type === 'OUTRIGHT');
    const championSelection = outright?.selections.find((s) => s.name === winnerName);
    if (outright && championSelection) {
      winners.push({ marketId: outright.id, selectionId: championSelection.id });
    }
  }

  return winners;
}
