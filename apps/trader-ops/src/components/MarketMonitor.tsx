import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@arena/web-auth';
import type { Market, Selection } from '@arena/contracts';
import { MarketListSchema, fetchJson } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { formatPrice } from '../lib/format';
import { usePoll } from '../hooks/usePoll';
import { diffPrices, overround, overroundDriftPct } from '../lib/markets';
import type { PriceMove } from '../lib/markets';
import { Panel } from './Panel';
import './MarketMonitor.css';

const MARKETS_URL = `${SERVICE_URLS.pricing}/markets`;
const POLL_MS = 3000;
const COLUMNS = 3;
const NUM = 'num';
const DASH = '—';

interface SelectionRowProps {
  selection: Selection;
  move: PriceMove | undefined;
}

/** One selection line: name, fair (pre-margin) probability, and the live price. */
function SelectionRow({ selection, move }: Readonly<SelectionRowProps>) {
  const fair =
    selection.probability !== undefined ? `${(selection.probability * 100).toFixed(1)}%` : DASH;
  let priceClass = NUM;
  let arrow = '';
  if (move === 'up') {
    priceClass = `${NUM} px-up`;
    arrow = ' ▲';
  } else if (move === 'down') {
    priceClass = `${NUM} px-down`;
    arrow = ' ▼';
  }
  return (
    <tr>
      <td>{selection.name}</td>
      <td className={`${NUM} muted`}>{fair}</td>
      <td className={priceClass}>
        {formatPrice(selection.price)}
        {arrow}
      </td>
    </tr>
  );
}

interface MarketGroupProps {
  market: Market;
  moves: Record<string, PriceMove>;
}

/** A market's header (status + margin health) followed by its selection rows. */
function MarketGroup({ market, moves }: Readonly<MarketGroupProps>) {
  const drift = overroundDriftPct(market);
  const sign = drift >= 0 ? '+' : '';
  return (
    <>
      <tr className="market-head">
        <td colSpan={COLUMNS}>
          <span className="market-name">{market.name}</span>{' '}
          <span className={`chip chip-${market.status}`}>{market.status}</span>{' '}
          <span className="muted">
            {overround(market).toFixed(3)} · {sign}
            {drift.toFixed(1)}% vs target
          </span>
        </td>
      </tr>
      {market.selections.map((selection) => (
        <SelectionRow key={selection.id} selection={selection} move={moves[selection.id]} />
      ))}
    </>
  );
}

/** Live odds board: every priced market, its margin health, and price moves. */
export function MarketMonitor() {
  const api = useApi();
  const fetcher = useCallback(() => fetchJson(api, MARKETS_URL, MarketListSchema), [api]);
  const { data, error, lastUpdatedAt } = usePoll(fetcher, POLL_MS);

  const [moves, setMoves] = useState<Record<string, PriceMove>>({});
  const prevRef = useRef<Market[] | null>(null);
  useEffect(() => {
    if (data) {
      setMoves(diffPrices(prevRef.current, data));
      prevRef.current = data;
    }
  }, [data]);

  return (
    <Panel
      title="MARKET MONITOR"
      source="pricing :4001 /markets"
      area="markets"
      lastUpdatedAt={lastUpdatedAt}
      error={error}
    >
      {data && data.length > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>selection</th>
              <th className={NUM}>fair %</th>
              <th className={NUM}>price</th>
            </tr>
          </thead>
          <tbody>
            {data.map((market) => (
              <MarketGroup key={market.id} market={market} moves={moves} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">no markets priced yet</p>
      )}
    </Panel>
  );
}
