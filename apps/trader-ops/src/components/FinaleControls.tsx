import { useState } from 'react';
import { SimStateSchema } from '@arena/contracts';
import type { SimState } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { fetchJson, jsonInit } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { SIMULATOR_ADMIN_KEY_STORAGE } from '../lib/adminKey';
import { AdminKeyPrompt, useAdminKey } from './AdminKeyPrompt';
import { Panel } from './Panel';
import './FinaleControls.css';

/** ms pause the sim leaves between simulated fixtures so the punter UIs can animate. */
const RUN_INTERVAL_MS = 2000;

const REJECTED_401 = 'command rejected (401): the simulator refused your session — sign in again';
const REJECTED_403 = 'command rejected (403): admin key refused — re-arm the simulator admin key';
const UNREACHABLE = 'simulator unreachable or errored';

const PLAY_NEXT_URL = `${SERVICE_URLS.simulator}/play-next`;
const RUN_URL = `${SERVICE_URLS.simulator}/run`;
const RESET_URL = `${SERVICE_URLS.simulator}/reset`;

interface CommandResult {
  ok: boolean;
  message: string;
}

/** Bracket position line for a settled command — the operator's proof it landed. */
function successMessage(state: SimState): string {
  const line = `bracket: ${state.playedFixtureIds.length} played · ${state.remainingFixtureIds.length} remaining`;
  return state.champion !== null ? `${line} · champion crowned` : line;
}

/** Turn a rejected command into an operator-actionable sentence. */
function failureMessage(status: number | null): string {
  if (status === 401) {
    return REJECTED_401;
  }
  if (status === 403) {
    return REJECTED_403;
  }
  return UNREACHABLE;
}

/** Success speaks to the status region; failure is an assertive alert. */
function ResultLine({ result }: Readonly<{ result: CommandResult | null }>) {
  if (result === null) {
    return null;
  }
  return (
    <p className={`fc-result ${result.ok ? 'pos' : 'neg'}`} role={result.ok ? 'status' : 'alert'}>
      {result.message}
    </p>
  );
}

/**
 * Simulator admin console: the single control surface that drives the show —
 * play the next fixture, fast-forward to the final, or reset the bracket. Each
 * command carries the Bearer JWT plus the runtime-typed `x-admin-key`; the reset
 * is fenced behind a two-step confirm because it unwinds every settled market.
 */
export function FinaleControls() {
  const { key, save, clear } = useAdminKey(SIMULATOR_ADMIN_KEY_STORAGE);
  const api = useApi();
  const [pending, setPending] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const send = async (url: string, body?: unknown): Promise<void> => {
    setPending(true);
    const headers: Record<string, string> = key ? { 'x-admin-key': key } : {};
    const outcome = await fetchJson(api, url, SimStateSchema, jsonInit('POST', body, headers));
    setPending(false);
    if (outcome.ok) {
      setLastRunAt(new Date().toISOString());
      setResult({ ok: true, message: successMessage(outcome.data) });
    } else {
      setResult({ ok: false, message: failureMessage(outcome.status) });
    }
  };

  const confirmReset = (): void => {
    setConfirmingReset(false);
    void send(RESET_URL);
  };

  return (
    <Panel
      title="FINALE CONTROL"
      source="simulator :4003 admin"
      area="finale"
      lastUpdatedAt={lastRunAt}
      error={null}
      actions={
        <AdminKeyPrompt label="simulator admin key" keyValue={key} onSave={save} onClear={clear} />
      }
    >
      <div className="fc-commands">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => void send(PLAY_NEXT_URL)}
        >
          play next fixture
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => void send(RUN_URL, { intervalMs: RUN_INTERVAL_MS })}
        >
          run to final
        </button>
        {confirmingReset ? (
          <span className="confirm-strip">
            reset the whole bracket?
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={confirmReset}
            >
              confirm
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => setConfirmingReset(false)}
            >
              abort
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => setConfirmingReset(true)}
          >
            reset bracket
          </button>
        )}
      </div>
      <ResultLine result={result} />
      <p className="panel-note">
        drives the whole show — play/run settle markets and move real balances
      </p>
    </Panel>
  );
}
