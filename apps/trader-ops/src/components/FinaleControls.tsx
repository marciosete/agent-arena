import { useState } from 'react';
import { SimStateSchema } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { adminActionError, ApiError, sendParsed } from '../lib/api';
import { SERVICE_URLS } from '../lib/config';
import { fmtClock } from '../lib/format';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { Panel } from './Panel';

type ActionId = 'play' | 'run' | 'reset';

interface FinaleAction {
  id: ActionId;
  label: string;
  className: string;
  path: string;
  body?: unknown;
  confirm: string;
}

/** The show-driver: one POST per button, each behind an inline confirm. */
const ACTIONS: readonly FinaleAction[] = [
  {
    id: 'play',
    label: 'Play next',
    className: 'btn btn-primary',
    path: '/play-next',
    confirm: 'Simulate the next fixture?',
  },
  {
    id: 'run',
    label: 'Run to final',
    className: 'btn',
    path: '/run',
    body: { intervalMs: 2000 },
    confirm: 'Fast-forward to the final?',
  },
  {
    id: 'reset',
    label: 'Reset bracket',
    className: 'btn btn-danger',
    path: '/reset',
    confirm: 'Reset the bracket to the real-world state?',
  },
];

/**
 * Finale control plane. Every simulator control POST rides the operator's session JWT
 * (attached by `apiFetch`); the simulator authorises it from the token's `admin` claim,
 * so there is no separate key to arm — a non-admin operator simply gets a 403. Each action
 * arms an inline confirm — no `window.confirm` — and only one action is armed at a time.
 */
export function FinaleControls() {
  const api = useApi();
  const onAuthError = useSessionGuard();
  const [armed, setArmed] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const armedAction = ACTIONS.find((action) => action.id === armed) ?? null;

  async function runAction(action: FinaleAction): Promise<void> {
    setBusy(true);
    try {
      await sendParsed(
        api,
        `${SERVICE_URLS.simulator}${action.path}`,
        { method: 'POST', body: action.body },
        SimStateSchema
      );
      setError(null);
      setDoneAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError(err); // expired session — back to login, same as a read 401
        return;
      }
      setError(adminActionError(err));
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  return (
    <Panel title="Finale control">
      {error && <p className="error-note">{error}</p>}
      <div className="btn-row">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.className}
            disabled={busy || armed !== null}
            onClick={() => {
              setDoneAt(null);
              setArmed(action.id);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      {armedAction && (
        <div className="confirm-row">
          <span>{armedAction.confirm}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void runAction(armedAction)}
          >
            Confirm
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setArmed(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {doneAt && !error && <p className="muted">done {fmtClock(doneAt)}</p>}
    </Panel>
  );
}
