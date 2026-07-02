import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@arena/web-auth';
import { SimStateSchema, teamById } from '@arena/contracts';
import { fetchJson } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { usePoll } from '../hooks/usePoll';
import { deriveSettlements, mergeObservedOrder } from '../lib/settlements';
import type { SettlementRow } from '../lib/settlements';
import { Panel } from './Panel';

const STATE_URL = `${SERVICE_URLS.simulator}/state`;
const POLL_MS = 2500;

interface FeedItemProps {
  row: SettlementRow;
}

/** One settled result: the scoreline (with a pens badge) and the market it closed. */
function FeedItem({ row }: Readonly<FeedItemProps>) {
  return (
    <li className="feed-item">
      <div className="feed-line">
        <span className="tag">{row.round}</span>
        <span className="feed-score">
          {row.homeName} {row.homeScore}–{row.awayScore} {row.awayName}
        </span>
        {row.decidedOnPenalties && <span className="pens-badge">pens</span>}
      </div>
      <div className="muted">
        winner {row.winnerName} · market {row.marketId} settled
      </div>
    </li>
  );
}

/** Live results feed from the simulator, newest settlement on top across polls. */
export function SettlementFeed() {
  const api = useApi();
  const fetcher = useCallback(() => fetchJson(api, STATE_URL, SimStateSchema), [api]);
  const { data, error, lastUpdatedAt } = usePoll(fetcher, POLL_MS);

  const rows = useMemo(() => (data ? deriveSettlements(data.fixtures) : []), [data]);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder((prev) => mergeObservedOrder(prev, rows));
  }, [rows]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.fixtureId, row])), [rows]);
  const ordered = order
    .map((id) => byId.get(id))
    .filter((row): row is SettlementRow => row !== undefined);

  const champion = data?.champion ?? null;

  return (
    <Panel
      title="SETTLEMENT FEED"
      source="simulator :4003 /state"
      area="feed"
      lastUpdatedAt={lastUpdatedAt}
      error={error}
    >
      {champion !== null && (
        <p className="champion-banner">champion — {teamById(champion)?.name ?? champion} 🏆</p>
      )}
      {ordered.length > 0 ? (
        <ul className="feed">
          {ordered.map((row) => (
            <FeedItem key={row.fixtureId} row={row} />
          ))}
        </ul>
      ) : (
        <p className="empty">no results yet — the bracket is live</p>
      )}
    </Panel>
  );
}
