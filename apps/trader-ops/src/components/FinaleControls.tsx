import { useCallback, useState } from 'react';
import { SimStateSchema } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { errorMessage, sendParsed } from '../lib/api';
import { SERVICE_URLS, STORAGE_KEYS } from '../lib/config';
import { fmtClock } from '../lib/format';
import { useAdminKeyGate } from '../hooks/useAdminKeyGate';
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
 * Optional finale control plane. Every simulator control POST needs the JWT plus the
 * SIMULATOR_ADMIN_KEY (a different key from the flags one) as `x-admin-key`; the key is
 * prompted for once and kept in localStorage, never bundled. Each action arms an inline
 * confirm — no `window.confirm` — and only one action is armed at a time.
 */
export function FinaleControls() {
  const api = useApi();
  const [armed, setArmed] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);

  // Clearing the key (Change key, or a rejection) also disarms any pending confirm —
  // a keyless Confirm button must never sit on screen doing nothing.
  const disarm = useCallback(() => setArmed(null), []);
  const gate = useAdminKeyGate({
    storageKey: STORAGE_KEYS.simAdminKey,
    label: 'simulator controls',
    keyName: 'SIMULATOR_ADMIN_KEY',
    onClear: disarm,
  });

  const armedAction = ACTIONS.find((action) => action.id === armed) ?? null;

  async function runAction(action: FinaleAction): Promise<void> {
    if (!gate.adminKey) {
      setArmed(null);
      return;
    }
    setBusy(true);
    try {
      await sendParsed(
        api,
        `${SERVICE_URLS.simulator}${action.path}`,
        { method: 'POST', body: action.body, adminKey: gate.adminKey },
        SimStateSchema
      );
      setError(null);
      setDoneAt(Date.now());
    } catch (err) {
      setError(gate.rejectionMessage(err) ?? errorMessage(err));
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  return (
    <Panel title="Finale control" actions={gate.actionNode}>
      {gate.promptNode}
      {error && <p className="error-note">{error}</p>}
      <div className="btn-row">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.className}
            disabled={!gate.adminKey || busy || armed !== null}
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
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={disarm}>
            Cancel
          </button>
        </div>
      )}
      {doneAt && !error && <p className="muted">done {fmtClock(doneAt)}</p>}
    </Panel>
  );
}
