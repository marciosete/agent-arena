import { useCallback, useEffect, useRef, useState } from 'react';
import { MarketSchema, type Market } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { fetchParsed } from '../lib/api';
import { POLL_MS, SERVICE_URLS } from '../lib/config';
import { fmtOdds, fmtPct } from '../lib/format';
import { usePoll } from '../hooks/usePoll';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { diffPrices, moveKey, overround, type PriceMove } from '../lib/priceMoves';
import { Panel } from './Panel';

const MARKETS_URL = `${SERVICE_URLS.pricing}/markets`;
const marketsParser = MarketSchema.array();

export interface MarketMonitorProps {
  /** Poll cadence in ms; defaults to the markets board cadence. */
  pollMs?: number;
}

/** Price cell class: highlight up/down when the selection moved since the last poll. */
function priceClass(move: PriceMove | undefined): string {
  if (move === 'up') {
    return 'num px-up';
  }
  if (move === 'down') {
    return 'num px-down';
  }
  return 'num';
}

/** One market: a header row (name · status · book total) then a row per selection. */
function MarketGroup({
  market,
  moves,
}: Readonly<{ market: Market; moves: Record<string, PriceMove> }>) {
  return (
    <tbody>
      <tr>
        <td colSpan={3}>
          {market.name} <span className={`chip chip-${market.status}`}>{market.status}</span>{' '}
          <span className="muted">book {fmtPct(overround(market))}</span>
        </td>
      </tr>
      {market.selections.map((sel) => (
        <tr key={sel.id}>
          <td>{sel.name}</td>
          <td className={priceClass(moves[moveKey(market.id, sel.id)])}>{fmtOdds(sel.price)}</td>
          <td className="num">
            {sel.probability === undefined ? (
              <span className="muted">—</span>
            ) : (
              fmtPct(sel.probability)
            )}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Live prices from pricing (:4001) with the fair probability alongside — the margin
 * made visible. Each poll diffs against the previous snapshot so a moved price flashes
 * green (up) or red (down) until the next tick supersedes it.
 */
export function MarketMonitor({ pollMs = POLL_MS.markets }: Readonly<MarketMonitorProps>) {
  const api = useApi();
  const fetcher = useCallback(() => fetchParsed(api, MARKETS_URL, marketsParser), [api]);
  const onAuthError = useSessionGuard();
  const { data, error, updatedAt } = usePoll(fetcher, pollMs, onAuthError);

  const prevRef = useRef<Market[] | null>(null);
  const [moves, setMoves] = useState<Record<string, PriceMove>>({});

  useEffect(() => {
    if (!data) {
      return;
    }
    setMoves(diffPrices(prevRef.current, data));
    prevRef.current = data;
  }, [data]);

  // A failed poll means "moved since the last poll" no longer holds — kill stale flashes.
  useEffect(() => {
    if (error) {
      setMoves({});
    }
  }, [error]);

  const markets = data ?? [];

  return (
    <Panel title="Market monitor" meta={{ updatedAt, error }}>
      {markets.length === 0 ? (
        <p className="empty">No markets.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Selection</th>
              <th className="num">Price</th>
              <th className="num">Fair prob</th>
            </tr>
          </thead>
          {markets.map((market) => (
            <MarketGroup key={market.id} market={market} moves={moves} />
          ))}
        </table>
      )}
    </Panel>
  );
}
