import { useCallback } from 'react';
import { OPENING_BALANCE } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { AccountListSchema, fetchJson } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { formatMoney, formatSigned } from '../lib/format';
import { usePoll } from '../hooks/usePoll';
import { buildLeaderboard, type LeaderboardRow } from '../lib/leaderboard';
import { Panel } from './Panel';
import './Leaderboard.css';

const ACCOUNTS_URL = `${SERVICE_URLS.betting}/accounts`;
const POLL_MS = 3_000;
/** Right-aligned numeric column class, shared by the balance/P&L cells + headers. */
const NUM_COL = 'num';

/** Signed-P&L cell colour: green in profit, red in the red, muted at break-even. */
function pnlClass(pnl: number): string {
  if (pnl > 0) {
    return 'pos';
  }
  if (pnl < 0) {
    return 'neg';
  }
  return 'muted';
}

/** One punter's standings row. */
function PunterRow({ row }: Readonly<{ row: LeaderboardRow }>) {
  const { account, rank, pnl, isTopWinner } = row;
  return (
    <tr>
      <td className="lb-rank">{rank}</td>
      <td>
        <span className="lb-name">{account.name}</span>
        {account.isBot && <span className="tag lb-tag">bot</span>}
      </td>
      <td className={NUM_COL}>{formatMoney(account.balance)}</td>
      <td className={`${NUM_COL} ${pnlClass(pnl)}`}>{formatSigned(pnl)}</td>
      <td>{isTopWinner && <span className="tag tag-accent">hot</span>}</td>
    </tr>
  );
}

/**
 * PUNTER WATCHLIST — the standings board. Polls the betting service's accounts,
 * ranks them by balance, and prints P&L against the opening stake. In the finale
 * this same board doubles as the bot leaderboard.
 */
export function Leaderboard() {
  const api = useApi();
  const fetcher = useCallback(() => fetchJson(api, ACCOUNTS_URL, AccountListSchema), [api]);
  const { data, error, lastUpdatedAt } = usePoll(fetcher, POLL_MS);

  const rows = data ? buildLeaderboard(data) : [];

  return (
    <Panel
      title="PUNTER WATCHLIST"
      source="betting :4002 /accounts"
      area="leaderboard"
      lastUpdatedAt={lastUpdatedAt}
      error={error}
    >
      {rows.length === 0 ? (
        <p className="empty">no punters on the book yet</p>
      ) : (
        <>
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Punter</th>
                <th className={NUM_COL}>Balance</th>
                <th className={NUM_COL}>P&amp;L</th>
                <th aria-label="hot streak" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PunterRow key={row.account.id} row={row} />
              ))}
            </tbody>
          </table>
          <p className="panel-note">
            P&amp;L vs opening balance {formatMoney(OPENING_BALANCE)} · doubles as the bot
            leaderboard in the finale
          </p>
        </>
      )}
    </Panel>
  );
}
