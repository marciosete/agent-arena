import { useCallback } from 'react';
import { ExposureReportSchema } from '@arena/contracts';
import type { ExposureReport } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { fetchJson } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { formatMoney } from '../lib/format';
import { usePoll } from '../hooks/usePoll';
import { Panel } from './Panel';
import {
  DEFAULT_HEAT_THRESHOLDS,
  exposureTotals,
  heatLevel,
  sortByLiability,
} from '../lib/exposure';
import type { ExposureTotals } from '../lib/exposure';

const EXPOSURE_URL = `${SERVICE_URLS.betting}/exposure`;
const POLL_MS = 3_000;
const EMPTY_MESSAGE = 'book is flat — no exposure yet';
const RIGHT = 'num';

/** The one knob for what counts as hot — the legend renders straight from it. */
const THRESHOLDS = DEFAULT_HEAT_THRESHOLDS;

type ExposureMarket = ExposureReport['markets'][number];

/** Live trader back-office view of staked money and worst-case liability per market. */
export function ExposureBoard() {
  const api = useApi();
  const fetcher = useCallback(() => fetchJson(api, EXPOSURE_URL, ExposureReportSchema), [api]);
  const { data, error, lastUpdatedAt } = usePoll(fetcher, POLL_MS);

  return (
    <Panel
      title="EXPOSURE / LIABILITY"
      source="betting :4002 /exposure"
      area="exposure"
      lastUpdatedAt={lastUpdatedAt}
      error={error}
    >
      <ExposureBody report={data} />
    </Panel>
  );
}

function ExposureBody({ report }: Readonly<{ report: ExposureReport | null }>) {
  const markets = report?.markets ?? [];
  if (markets.length === 0) {
    return <p className="empty">{EMPTY_MESSAGE}</p>;
  }
  const totals = exposureTotals(markets);
  const sorted = sortByLiability(markets);
  const peak = Math.max(...markets.map((market) => market.maxLiability));
  return (
    <>
      <TotalsTiles totals={totals} />
      <table className="tbl">
        <thead>
          <tr>
            <th>market</th>
            <th>status</th>
            <th className={RIGHT}>staked</th>
            <th className={RIGHT}>bets</th>
            <th className={RIGHT}>liability</th>
            <th aria-label="controls" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((market) => (
            <MarketRow key={market.marketId} market={market} peak={peak} />
          ))}
        </tbody>
      </table>
      <p className="panel-note">
        heat: low &lt; {formatMoney(THRESHOLDS.amber)} ≤ amber &lt; {formatMoney(THRESHOLDS.red)} ≤
        red
      </p>
    </>
  );
}

function TotalsTiles({ totals }: Readonly<{ totals: ExposureTotals }>) {
  // Plain values — heat lives on the per-market liability column. Banding the
  // book-wide SUM against single-market thresholds would glow red during normal
  // trading (many calm markets still sum past a per-market red), a false alarm.
  const tiles = [
    { label: 'total staked', value: totals.totalStaked },
    { label: 'worst-case liability', value: totals.maxLiability },
    { label: 'open markets', value: totals.openCount },
  ];
  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <div className="tile" key={tile.label}>
          <span className="tile-label">{tile.label}</span>
          <span className="tile-value">{formatMoney(tile.value)}</span>
        </div>
      ))}
    </div>
  );
}

function MarketRow({ market, peak }: Readonly<{ market: ExposureMarket; peak: number }>) {
  const level = heatLevel(market.maxLiability, THRESHOLDS);
  const pct = peak > 0 ? (market.maxLiability / peak) * 100 : 0;
  return (
    <tr>
      <td>{market.marketName}</td>
      <td>
        <span className={`chip chip-${market.status}`}>{market.status}</span>
      </td>
      <td className={RIGHT}>{formatMoney(market.totalStaked)}</td>
      <td className={RIGHT}>{market.betCount}</td>
      <td className={RIGHT}>
        <span className={`heat-${level}`}>{formatMoney(market.maxLiability)}</span>
        <span className="bar">
          <span className={`bar-fill heat-${level}`} style={{ width: `${pct}%` }} />
        </span>
      </td>
      <td>
        <button type="button" className="btn btn-sm" disabled title="pending contract amendment">
          suspend
        </button>
      </td>
    </tr>
  );
}
