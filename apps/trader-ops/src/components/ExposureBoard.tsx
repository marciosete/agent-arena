import { useCallback } from 'react';
import { useApi } from '@arena/web-auth';
import { ExposureReportSchema, type ExposureReport } from '@arena/contracts';
import { POLL_MS, SERVICE_URLS } from '../lib/config';
import { fetchParsed } from '../lib/api';
import { usePoll } from '../hooks/usePoll';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { fmtMoney } from '../lib/format';
import { Panel } from './Panel';
import {
  DEFAULT_HEAT_THRESHOLDS,
  heatLevel,
  sortByLiability,
  summarise,
  type ExposureSummary,
  type HeatThresholds,
} from '../lib/exposure';

export interface ExposureBoardProps {
  /** Poll cadence; traders want exposure hot (~3s). */
  pollMs?: number;
  /** Configurable heat cut-offs for the liability column. */
  thresholds?: HeatThresholds;
}

const EXPOSURE_URL = `${SERVICE_URLS.betting}/exposure`;
const EMPTY_SUMMARY: ExposureSummary = { totalStaked: 0, totalLiability: 0, openCount: 0 };

/**
 * Where is the book exposed? Polls betting's `/exposure`, ranks markets by
 * worst-case liability and heat-colours the risk. A poll blip keeps the last
 * good data on screen and surfaces the error in the panel meta.
 */
export function ExposureBoard({
  pollMs = POLL_MS.exposure,
  thresholds = DEFAULT_HEAT_THRESHOLDS,
}: Readonly<ExposureBoardProps>) {
  const api = useApi();
  const fetcher = useCallback(
    () => fetchParsed<ExposureReport>(api, EXPOSURE_URL, ExposureReportSchema),
    [api]
  );
  const onAuthError = useSessionGuard();
  const { data, error, updatedAt } = usePoll<ExposureReport>(fetcher, pollMs, onAuthError);

  const markets = data ? sortByLiability(data.markets) : [];
  const summary = data ? summarise(data) : EMPTY_SUMMARY;

  return (
    <Panel title="Exposure / liability" meta={{ updatedAt, error }}>
      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Total staked</span>
          <span className="tile-value">{fmtMoney(summary.totalStaked)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Worst-case liability</span>
          <span className="tile-value">{fmtMoney(summary.totalLiability)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Open markets</span>
          <span className="tile-value">{summary.openCount}</span>
        </div>
      </div>
      {markets.length === 0 ? (
        <p className="empty">No exposure to report.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Market</th>
              <th>Status</th>
              <th className="num">Staked</th>
              <th className="num">Bets</th>
              <th className="num">Max liability</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.marketId}>
                <td>{market.marketName}</td>
                <td>
                  <span className={`chip chip-${market.status}`}>{market.status}</span>
                </td>
                <td className="num">{fmtMoney(market.totalStaked)}</td>
                <td className="num">{market.betCount}</td>
                <td className={`num heat-${heatLevel(market.maxLiability, thresholds)}`}>
                  {fmtMoney(market.maxLiability)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
