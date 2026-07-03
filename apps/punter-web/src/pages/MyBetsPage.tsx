import { useCallback, useMemo } from 'react';
import type { Bet, Market } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { getBets, getMarkets } from '../api';
import { POLL_MS } from '../config';
import { betReturn, formatDonuts, formatPrice } from '../format';
import { usePoll } from '../hooks';

/**
 * `/my-bets` (flag `punter-my-bets`): the punter's own bets — pending / won /
 * lost — polled so settlements flip live during a sim run.
 */
export function MyBetsPage() {
  const { session, apiFetch } = useAuth();
  const accountId = session?.account.id;
  const bets = usePoll(
    useCallback(
      () => (accountId ? getBets(apiFetch, accountId) : Promise.resolve(null)),
      [apiFetch, accountId]
    ),
    POLL_MS.bets
  );
  const markets = usePoll(
    useCallback(() => getMarkets(apiFetch), [apiFetch]),
    POLL_MS.markets
  );

  return (
    <main className="page">
      <h1 className="page-title">My Bets</h1>
      <BetList bets={bets} markets={markets} />
    </main>
  );
}

export function BetList({
  bets,
  markets,
}: Readonly<{ bets: Bet[] | null; markets: Market[] | null }>) {
  const sorted = useMemo(
    () => [...(bets ?? [])].sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    [bets]
  );
  const marketsById = useMemo(
    () => new Map((markets ?? []).map((market) => [market.id, market])),
    [markets]
  );

  // null = not loaded (first poll pending or betting unreachable) — don't tell a
  // punter with live bets that they have none.
  if (bets === null) {
    return <p className="page-empty">Fetching your bets…</p>;
  }
  if (sorted.length === 0) {
    return <p className="page-empty">No bets yet — pick a price on the bracket or the board.</p>;
  }
  return (
    <ul className="bets" aria-label="my bets">
      {sorted.map((bet) => (
        <BetRow key={bet.id} bet={bet} market={marketsById.get(bet.marketId)} />
      ))}
    </ul>
  );
}

function BetRow({ bet, market }: Readonly<{ bet: Bet; market: Market | undefined }>) {
  const selectionName =
    market?.selections.find((selection) => selection.id === bet.selectionId)?.name ??
    bet.selectionId;
  const settled = bet.status !== 'pending'; // won, lost and void all read past-tense
  return (
    <li className={`bet-row bet-${bet.status}`}>
      <span className={`bet-chip chip-${bet.status}`}>{bet.status}</span>
      <span className="bet-what">
        <strong>{selectionName}</strong>
        <span className="bet-market">{market?.name ?? bet.marketId}</span>
      </span>
      <span className="bet-numbers">
        {formatDonuts(bet.stake)} @ {formatPrice(bet.price)}
        <span className="bet-return">
          {settled ? 'returned' : 'returns'} {formatDonuts(betReturn(bet))}
        </span>
      </span>
    </li>
  );
}
