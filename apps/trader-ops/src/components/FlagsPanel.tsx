import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@arena/web-auth';
import { FeatureFlagSchema } from '@arena/contracts';
import type { FeatureFlag } from '@arena/contracts';
import { fetchJson, FlagListSchema, jsonInit } from '../lib/api';
import { SERVICE_URLS } from '../lib/urls';
import { formatClock } from '../lib/format';
import { FLAGS_ADMIN_KEY_STORAGE } from '../lib/adminKey';
import { usePoll } from '../hooks/usePoll';
import { AdminKeyPrompt, useAdminKey } from './AdminKeyPrompt';
import { Panel } from './Panel';
import './FlagsPanel.css';

const ADMIN_HEADER = 'x-admin-key';
const NUM = 'num';
const POLL_INTERVAL_MS = 5_000;

const REJECT_401 = 'release rejected (401): the service refused your session — sign in again';
const REJECT_403 = 'release rejected (403): admin key refused — re-arm the flags admin key';
const RELEASE_FAILED = 'release failed — flags service unreachable or errored';

/** Map a failed write's HTTP status onto the operator-facing rejection copy. */
function releaseErrorMessage(status: number | null): string {
  if (status === 401) {
    return REJECT_401;
  }
  if (status === 403) {
    return REJECT_403;
  }
  return RELEASE_FAILED;
}

/** Polled flags with any in-flight optimistic override applied, sorted by key. */
function mergeFlags(
  data: readonly FeatureFlag[] | null,
  overrides: Readonly<Record<string, FeatureFlag>>
): FeatureFlag[] {
  if (data === null) {
    return [];
  }
  return data.map((flag) => overrides[flag.key] ?? flag).sort((a, b) => a.key.localeCompare(b.key));
}

/** Drop an optimistic override once a poll reports the same enabled state. */
function reconcileOverrides(
  live: readonly FeatureFlag[],
  overrides: Readonly<Record<string, FeatureFlag>>
): Record<string, FeatureFlag> {
  const next: Record<string, FeatureFlag> = {};
  let dropped = false;
  for (const override of Object.values(overrides)) {
    const current = live.find((flag) => flag.key === override.key);
    if (current && current.enabled === override.enabled) {
      dropped = true;
    } else {
      next[override.key] = override;
    }
  }
  return dropped ? next : (overrides as Record<string, FeatureFlag>);
}

interface FlagRowProps {
  flag: FeatureFlag;
  armed: boolean;
  busy: boolean;
  onArm: (flag: FeatureFlag) => void;
  onConfirm: (flag: FeatureFlag) => void;
  onAbort: () => void;
}

/** One flag: description, last-changed clock, and the two-step release control. */
function FlagRow({ flag, armed, busy, onArm, onConfirm, onAbort }: Readonly<FlagRowProps>) {
  const willEnable = !flag.enabled;
  const verb = willEnable ? 'release' : 'darken';
  return (
    <tr>
      <td>{flag.key}</td>
      <td className="muted">{flag.description}</td>
      <td className={`${NUM} muted`}>{formatClock(flag.updatedAt)}</td>
      <td className={NUM}>
        <div className="flag-control">
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={flag.enabled}
            aria-label={`toggle ${flag.key}`}
            disabled={busy}
            onClick={() => onArm(flag)}
          />
          {armed && (
            <span className="confirm-strip">
              <span>
                {verb} {flag.key}?
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => onConfirm(flag)}
              >
                confirm
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onAbort}>
                abort
              </button>
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * RELEASE CONSOLE — how a dark-shipped feature goes live during the show.
 * Flags are polled read-only every 5s; flipping one is a Bearer + admin-key
 * PUT behind a two-step arm/confirm, applied optimistically and rolled back if
 * the service refuses it.
 */
export function FlagsPanel() {
  const api = useApi();
  const { key, save, clear } = useAdminKey(FLAGS_ADMIN_KEY_STORAGE);
  const fetchFlags = useCallback(
    () => fetchJson(api, `${SERVICE_URLS.flags}/flags`, FlagListSchema),
    [api]
  );
  const { data, error, lastUpdatedAt, refresh } = usePoll(fetchFlags, POLL_INTERVAL_MS);

  const [overrides, setOverrides] = useState<Record<string, FeatureFlag>>({});
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (data !== null) {
      setOverrides((prev) => reconcileOverrides(data, prev));
    }
  }, [data]);

  const commit = useCallback(
    async (flag: FeatureFlag) => {
      const next = !flag.enabled;
      setArmedKey(null);
      setAlert(null);
      setOverrides((prev) => ({ ...prev, [flag.key]: { ...flag, enabled: next } }));
      setBusyKeys((prev) => new Set(prev).add(flag.key));
      const result = await fetchJson(
        api,
        `${SERVICE_URLS.flags}/flags/${flag.key}`,
        FeatureFlagSchema,
        jsonInit('PUT', { enabled: next }, key ? { [ADMIN_HEADER]: key } : {})
      );
      setBusyKeys((prev) => {
        const updated = new Set(prev);
        updated.delete(flag.key);
        return updated;
      });
      if (result.ok) {
        setOverrides((prev) => ({ ...prev, [flag.key]: result.data }));
        void refresh();
      } else {
        setOverrides((prev) => {
          const updated = { ...prev };
          delete updated[flag.key];
          return updated;
        });
        setAlert(releaseErrorMessage(result.status));
      }
    },
    [api, key, refresh]
  );

  const arm = useCallback((flag: FeatureFlag) => setArmedKey(flag.key), []);
  const abort = useCallback(() => setArmedKey(null), []);

  const flags = useMemo(() => mergeFlags(data, overrides), [data, overrides]);

  return (
    <Panel
      title="RELEASE CONSOLE"
      source="flags :4004 /flags"
      area="flags"
      lastUpdatedAt={lastUpdatedAt}
      error={error}
      actions={
        <AdminKeyPrompt label="flags admin key" keyValue={key} onSave={save} onClear={clear} />
      }
    >
      {alert !== null && (
        <p className="release-alert" role="alert">
          {alert}
        </p>
      )}
      {data === null ? (
        <p className="empty">no flags yet — flags service warming up</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>flag</th>
              <th>description</th>
              <th className={NUM}>changed</th>
              <th className={NUM}>release</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <FlagRow
                key={flag.key}
                flag={flag}
                armed={armedKey === flag.key}
                busy={busyKeys.has(flag.key)}
                onArm={arm}
                onConfirm={commit}
                onAbort={abort}
              />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
