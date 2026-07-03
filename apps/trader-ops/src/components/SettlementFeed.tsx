import { useCallback } from 'react';
import { SimStateSchema, teamById } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { fetchParsed } from '../lib/api';
import { POLL_MS, SERVICE_URLS } from '../lib/config';
import { deriveSettlements } from '../lib/settlements';
import { usePoll } from '../hooks/usePoll';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { Panel } from './Panel';

export interface SettlementFeedProps {
  /** Poll cadence override (tests slow this right down). */
  pollMs?: number;
}

/**
 * Live settlement feed: as fixtures flip to `finished` in `GET /state`, they land here
 * newest-first — result, penalties tag, the winner who advances, and the MATCH_WINNER
 * market that settled. `/state` is the only source of live results (integration §3).
 */
export function SettlementFeed({ pollMs = POLL_MS.state }: Readonly<SettlementFeedProps>) {
  const api = useApi();
  const fetcher = useCallback(
    () => fetchParsed(api, `${SERVICE_URLS.simulator}/state`, SimStateSchema),
    [api]
  );
  const onAuthError = useSessionGuard();
  const { data, error, updatedAt } = usePoll(fetcher, pollMs, onAuthError);

  const settlements = data ? deriveSettlements(data.fixtures) : [];
  const champion = data?.champion ?? null;
  const championName = champion ? (teamById(champion)?.name ?? champion) : null;

  return (
    <Panel title="Settlement feed" meta={{ updatedAt, error }}>
      {championName && <p className="feed-line">{`🏆 ${championName} are world champions`}</p>}
      {settlements.length === 0 ? (
        <p className="empty">No fixtures settled yet.</p>
      ) : (
        <ul className="feed">
          {settlements.map((s) => (
            <li className="feed-item" key={s.fixtureId}>
              <span className="feed-line">
                {`${s.homeName} ${s.homeScore}–${s.awayScore} ${s.awayName}`}
                {s.decidedOnPenalties && <span className="tag-pens">PENS</span>}
                {` → ${s.winnerName} advance`}
              </span>
              <span className="feed-sub">{`${s.round} · market ${s.marketId} settled`}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
