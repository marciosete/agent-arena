import { useCallback, useEffect, useState } from 'react';
import { FeatureFlagSchema, type FeatureFlag } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { POLL_MS, SERVICE_URLS, STORAGE_KEYS } from '../lib/config';
import { errorMessage, fetchParsed, sendParsed } from '../lib/api';
import { fmtClock } from '../lib/format';
import { usePoll } from '../hooks/usePoll';
import { useAdminKeyGate } from '../hooks/useAdminKeyGate';
import { useSessionGuard } from '../hooks/useSessionGuard';
import { Panel } from './Panel';

/** Derive the list schema from the single contract schema — never a locally-imported `z.array`. */
const FlagListSchema = FeatureFlagSchema.array();

/** A flag armed for the confirm gate: which key, and which way the flip is heading. */
interface ArmedFlip {
  key: string;
  next: boolean;
}

interface FlagRowProps {
  flag: FeatureFlag;
  /** Effective state (poll data with any optimistic override applied). */
  enabled: boolean;
  /** True while there is no admin key or a flip is in flight — a flip must be impossible. */
  disabled: boolean;
  /** The armed flip when it belongs to THIS row, else null (one confirm at a time). */
  armed: ArmedFlip | null;
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** One release line: key, description, last-flipped time, the switch, and its confirm gate. */
function FlagRow({
  flag,
  enabled,
  disabled,
  armed,
  onArm,
  onConfirm,
  onCancel,
}: Readonly<FlagRowProps>) {
  return (
    <>
      <div className="flag-row">
        <div className="flag-info">
          <span className="flag-key">{flag.key}</span>
          <span className="flag-desc">{flag.description}</span>
        </div>
        <span className="flag-updated">{fmtClock(Date.parse(flag.updatedAt))}</span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={enabled}
          aria-label={`toggle ${flag.key}`}
          disabled={disabled}
          onClick={onArm}
        />
      </div>
      {armed && (
        <div className="confirm-row">
          <span>
            {armed.next ? `Release ${flag.key} to production?` : `Kill ${flag.key} in production?`}
          </span>
          <button
            type="button"
            className={armed.next ? 'btn btn-primary btn-sm' : 'btn btn-danger btn-sm'}
            onClick={onConfirm}
          >
            Confirm
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

export interface FlagsPanelProps {
  /** Poll cadence; tests pass a huge value and lean on the initial fetch. */
  pollMs?: number;
}

/** Drop the optimistic overrides that fresh poll data now agrees with. */
function withoutConfirmed(
  current: Record<string, boolean>,
  flags: FeatureFlag[]
): Record<string, boolean> {
  const confirmed = Object.keys(current).filter((key) =>
    flags.some((flag) => flag.key === key && flag.enabled === current[key])
  );
  if (confirmed.length === 0) {
    return current;
  }
  const next = { ...current };
  for (const key of confirmed) {
    delete next[key];
  }
  return next;
}

/**
 * Release console — the switchboard the show host drives. Everything ships dark;
 * flipping a flag reveals a feature in production (`PUT /flags/:key`) with no redeploy,
 * so each flip is a deploy button: confirm-gated, and gated again by the flags admin key
 * on top of the session JWT. The key is prompted for once, kept in localStorage, and never
 * baked into the bundle.
 */
export function FlagsPanel({ pollMs = POLL_MS.flags }: Readonly<FlagsPanelProps>) {
  const api = useApi();
  const flagsUrl = `${SERVICE_URLS.flags}/flags`;

  const fetchFlags = useCallback(() => fetchParsed(api, flagsUrl, FlagListSchema), [api, flagsUrl]);
  const onAuthError = useSessionGuard();
  const { data, error, updatedAt, refresh } = usePoll(fetchFlags, pollMs, onAuthError);

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState<ArmedFlip | null>(null);
  const [flipError, setFlipError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const disarm = useCallback(() => setArmed(null), []);
  const gate = useAdminKeyGate({
    storageKey: STORAGE_KEYS.flagsAdminKey,
    label: 'flag flips',
    keyName: 'FLAGS_ADMIN_KEY',
    onClear: disarm,
  });

  // An override lives from the optimistic flip until the poll confirms it (a successful
  // PUT keeps it, so the switch never flickers back while the refresh is in flight).
  useEffect(() => {
    if (data) {
      setOverrides((current) => withoutConfirmed(current, data));
    }
  }, [data]);

  function clearOverride(key: string): void {
    setOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function confirmFlip(): Promise<void> {
    if (!armed || !gate.adminKey) {
      return;
    }
    const { key, next } = armed;
    setArmed(null);
    setFlipError(null);
    setSubmitting(true);
    // Optimistic: show the flip immediately, roll back if the release fails.
    setOverrides((current) => ({ ...current, [key]: next }));
    try {
      await sendParsed(
        api,
        `${flagsUrl}/${key}`,
        { method: 'PUT', body: { enabled: next }, adminKey: gate.adminKey },
        FeatureFlagSchema
      );
      refresh();
    } catch (err) {
      clearOverride(key);
      // A rejected admin key (the shipped guard answers 401) is dropped so the prompt returns.
      setFlipError(gate.rejectionMessage(err) ?? errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const flags = data ?? [];

  return (
    <Panel title="Release console" meta={{ updatedAt, error }} actions={gate.actionNode}>
      {gate.promptNode}
      {flipError && (
        <p className="error-note" role="alert">
          {flipError}
        </p>
      )}
      {flags.length === 0 ? (
        <p className="empty">
          {error ? 'Flags service unreachable — retrying…' : 'No feature flags.'}
        </p>
      ) : (
        flags.map((flag) => {
          const enabled = overrides[flag.key] ?? flag.enabled;
          const rowArmed = armed && armed.key === flag.key ? armed : null;
          return (
            <FlagRow
              key={flag.key}
              flag={flag}
              enabled={enabled}
              disabled={!gate.adminKey || submitting}
              armed={rowArmed}
              onArm={() => setArmed({ key: flag.key, next: !enabled })}
              onConfirm={confirmFlip}
              onCancel={disarm}
            />
          );
        })
      )}
    </Panel>
  );
}
