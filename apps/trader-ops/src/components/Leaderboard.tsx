import { useCallback } from 'react';
import { AccountSchema, type Account } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { fetchParsed } from '../lib/api';
import { POLL_MS, SERVICE_URLS } from '../lib/config';
import { fmtMoney, fmtSignedMoney } from '../lib/format';
import { rankAccounts } from '../lib/leaderboard';
import { usePoll } from '../hooks/usePoll';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { Panel } from './Panel';

/** Derived on the contract's own zod instance — never `z.array` with a local zod. */
const AccountsSchema = AccountSchema.array();

export interface LeaderboardProps {
  /** Poll cadence; defaults to the accounts cadence. Tests pass a long interval. */
  pollMs?: number;
}

/** Right-align + colour the P&L column by direction; flat P&L stays neutral. */
function pnlClass(pnl: number): string {
  if (pnl > 0) {
    return 'num pos';
  }
  return pnl < 0 ? 'num neg' : 'num';
}

/**
 * Punter watchlist / bot leaderboard: who is winning too much. Balances ranked
 * richest-first with P&L against the opening balance, biggest winners flagged.
 */
export function Leaderboard({ pollMs = POLL_MS.accounts }: Readonly<LeaderboardProps>) {
  const api = useApi();
  const fetcher = useCallback(
    () => fetchParsed<Account[]>(api, `${SERVICE_URLS.betting}/accounts`, AccountsSchema),
    [api]
  );
  const onAuthError = useSessionGuard();
  const { data, error, updatedAt } = usePoll<Account[]>(fetcher, pollMs, onAuthError);
  const rows = data ? rankAccounts(data) : [];

  return (
    <Panel title="Punter watchlist" meta={{ updatedAt, error }}>
      {rows.length === 0 ? (
        <p className="empty">No punters on the book yet.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Punter</th>
              <th className="num">Balance</th>
              <th className="num">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account, rank, pnl, hot }) => (
              <tr key={account.id}>
                <td className="num muted">{rank}</td>
                <td>
                  {account.name}
                  {account.isBot && (
                    <>
                      {' '}
                      <span className="chip chip-bot">BOT</span>
                    </>
                  )}
                  {hot && (
                    <>
                      {' '}
                      <span className="chip chip-hot">HOT</span>
                    </>
                  )}
                </td>
                <td className="num">{fmtMoney(account.balance)}</td>
                <td className={pnlClass(pnl)}>{fmtSignedMoney(pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
