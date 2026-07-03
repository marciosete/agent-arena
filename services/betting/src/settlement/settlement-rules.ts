/**
 * Pure settlement outcome maths: given the pending bets on the settled
 * markets and the winning selection per market, decide which bets are won
 * and which are lost. No I/O — the service applies this inside a transaction.
 */

/** The slice of a pending Bet row that settlement needs. */
export interface SettleableBet {
  id: string;
  accountId: string;
  marketId: string;
  selectionId: string;
  /** locked at placement; credited in full when the bet wins */
  potentialReturn: number;
}

export interface WinningSelection {
  marketId: string;
  selectionId: string;
}

export interface SettlementOutcome {
  /** bets to mark `won` and credit `potentialReturn` */
  won: SettleableBet[];
  /** bets to mark `lost` (no money moves — the stake was debited at placement) */
  lostBetIds: string[];
}

/**
 * A bet wins when its (marketId, selectionId) pair is a winning selection;
 * it loses when its market is being settled but its selection did not win.
 * Bets on markets outside `winningSelections` are untouched — which is what
 * makes a repeated settlement call a no-op once bets have left `pending`.
 */
export function classifySettlement(
  pendingBets: readonly SettleableBet[],
  winningSelections: readonly WinningSelection[]
): SettlementOutcome {
  const settledMarketIds = new Set(winningSelections.map((w) => w.marketId));
  const winningPairs = new Set(winningSelections.map((w) => `${w.marketId}:${w.selectionId}`));

  const won: SettleableBet[] = [];
  const lostBetIds: string[] = [];
  for (const bet of pendingBets) {
    if (!settledMarketIds.has(bet.marketId)) {
      continue;
    }
    if (winningPairs.has(`${bet.marketId}:${bet.selectionId}`)) {
      won.push(bet);
    } else {
      lostBetIds.push(bet.id);
    }
  }
  return { won, lostBetIds };
}
