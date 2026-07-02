import { useCallback } from 'react';
import type { Bet, Market } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { fetchBets, fetchMarkets, fetchOutright } from '../api';
import { POLL } from '../config';
import { formatDonuts, formatPrice } from '../format';
import { usePoll } from '../hooks';
import { flagForSelection } from '../teams';

interface MyBetsData {
  bets: Bet[];
  markets: Market[];
}

const STATUS_LABEL: Record<Bet['status'], string> = {
  pending: 'Pending',
  won: 'Won',
  lost: 'Lost',
  void: 'Void',
};

function returnLine(bet: Bet): string {
  if (bet.status === 'won') {
    return `Returned ${formatDonuts(bet.potentialReturn)}`;
  }
  if (bet.status === 'lost') {
    return 'No return';
  }
  return `To return ${formatDonuts(bet.potentialReturn)}`;
}

function BetRow({ bet, markets }: Readonly<{ bet: Bet; markets: Market[] }>) {
  const market = markets.find((entry) => entry.id === bet.marketId);
  const selection = market?.selections.find((entry) => entry.id === bet.selectionId);
  const name = selection?.name ?? bet.selectionId;
  return (
    <li className={`bet-row bet-row--${bet.status}`}>
      <div className="bet-row-main">
        <span className="bet-selection">
          {selection ? (
            <span aria-hidden="true" className="bet-flag">
              {flagForSelection(selection)}
            </span>
          ) : null}
          {name}
        </span>
        <span className="bet-market">{market?.name ?? bet.marketId}</span>
      </div>
      <div className="bet-row-figures">
        <span className="bet-stake">
          {formatDonuts(bet.stake)} @ {formatPrice(bet.price)}
        </span>
        <span className="bet-return">{returnLine(bet)}</span>
      </div>
      <span className={`bet-status bet-status--${bet.status}`}>{STATUS_LABEL[bet.status]}</span>
    </li>
  );
}

/** The punter's history — polls so settlements flip pending → won/lost live. */
export function MyBetsPage() {
  const { apiFetch, session } = useAuth();
  const accountId = session?.account.id;

  const load = useCallback(async (): Promise<MyBetsData | null> => {
    if (!accountId) {
      return null;
    }
    const [bets, markets, outright] = await Promise.all([
      fetchBets(apiFetch, accountId),
      fetchMarkets(apiFetch),
      fetchOutright(apiFetch),
    ]);
    if (bets === null) {
      return null;
    }
    return { bets, markets: [...(markets ?? []), ...(outright ? [outright] : [])] };
  }, [apiFetch, accountId]);

  const data = usePoll(load, POLL.bets, session?.token);

  if (data === null) {
    return (
      <main className="shell">
        <h2 className="page-title">My Bets</h2>
        <p className="page-empty">Fetching your bets…</p>
      </main>
    );
  }

  const bets = [...data.bets].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
  );

  return (
    <main className="shell shell--top">
      <h2 className="page-title">My Bets</h2>
      {bets.length === 0 ? (
        <p className="page-empty">Nothing riding yet — open the markets and pick a winner.</p>
      ) : (
        <ul className="bet-list" aria-label="my bets">
          {bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} markets={data.markets} />
          ))}
        </ul>
      )}
    </main>
  );
}
