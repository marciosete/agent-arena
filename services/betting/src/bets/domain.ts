import type { Market, Selection } from '@arena/contracts';

/**
 * Bet-placement domain rules as pure functions — no I/O, exhaustively
 * unit-testable. The tolerance is betting's OWN rule (integration.md §5):
 * clients send the price they displayed and handle a 409 when it moved; no
 * other component may assume this number.
 */
export const PRICE_TOLERANCE = 0.05;

/**
 * Money moves in cents: stakes are quantised with {@link roundMoney} before
 * they touch a wallet, and anything smaller than one cent is not a bet — a
 * sub-cent stake would round its payout to 0, which is unrepresentable
 * (BetSchema requires a positive potentialReturn).
 */
export const MIN_STAKE = 0.01;

/** The fixed id of the tournament-winner market (integration.md §3). */
const OUTRIGHT_MARKET_ID = 'outright';

/**
 * Absolute slack for the boundary comparison: |2.1 - 2.0| is a hair over 0.1
 * in IEEE-754, and a price sitting exactly ON the tolerance line must count
 * as within it, not bounce off float noise.
 */
const PRICE_EPSILON = 1e-9;

/** Round a money amount to cents, taming IEEE-754 tails. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * True when the live price sits within `tolerance` (a fraction of the
 * ACCEPTED price — the one the punter saw) of `acceptedPrice`. Non-finite
 * inputs never validate: a NaN comparison must reject the bet, not let it
 * through.
 */
export function isPriceWithinTolerance(
  livePrice: number,
  acceptedPrice: number,
  tolerance: number = PRICE_TOLERANCE
): boolean {
  if (!Number.isFinite(livePrice) || !Number.isFinite(acceptedPrice)) {
    return false;
  }
  return Math.abs(livePrice - acceptedPrice) <= acceptedPrice * tolerance + PRICE_EPSILON;
}

/** Decimal-odds payout: stake × price, stake included, locked at placement. */
export function computePotentialReturn(stake: number, price: number): number {
  return roundMoney(stake * price);
}

/**
 * Market ids are derivable (integration.md §3): a MATCH_WINNER market's id
 * equals its fixtureId and the outright's id is the fixed string 'outright' —
 * so a marketId maps straight onto the pricing endpoint that serves it.
 */
export function resolveMarketPath(marketId: string): string {
  return marketId === OUTRIGHT_MARKET_ID
    ? `/${OUTRIGHT_MARKET_ID}`
    : `/markets/${encodeURIComponent(marketId)}`;
}

export function findSelection(market: Market, selectionId: string): Selection | undefined {
  return market.selections.find((selection) => selection.id === selectionId);
}
