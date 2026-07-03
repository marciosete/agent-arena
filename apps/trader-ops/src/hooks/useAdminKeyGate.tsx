import { useCallback, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { AdminKeyPrompt } from '../components/AdminKeyPrompt';
import { useStoredKey } from './useStoredKey';

export interface AdminKeyGateOptions {
  /** localStorage slot for this key (flags and simulator keys are separate). */
  storageKey: string;
  /** What the key unlocks, e.g. "flag flips". */
  label: string;
  /** Which env var holds it, e.g. "FLAGS_ADMIN_KEY". */
  keyName: string;
  /** Runs whenever the key is cleared (Change key, or a rejected key) — stable ref. */
  onClear?: () => void;
}

export interface AdminKeyGate {
  /** The stored key, or null while the prompt is up. */
  adminKey: string | null;
  /** Inline prompt to render while there is no key (null once unlocked). */
  promptNode: ReactNode | null;
  /** "Change key" header action to render once a key is stored. */
  actionNode: ReactNode | undefined;
  /**
   * Handle a failed admin-keyed mutation. The shipped guards reject a bad
   * `x-admin-key` with 401 (flags) or 403, so either status on a call that
   * carried the key means the key is no good: drop it (the prompt returns)
   * and hand back a clear message. Returns null for non-gate failures.
   */
  rejectionMessage: (err: unknown) => string | null;
}

/**
 * The shared admin-key lifecycle used by every control-plane panel: prompt once,
 * keep the key in localStorage (never in the bundle), offer "Change key", and
 * self-heal when the service rejects the key.
 */
export function useAdminKeyGate({
  storageKey,
  label,
  keyName,
  onClear,
}: AdminKeyGateOptions): AdminKeyGate {
  const [adminKey, setKey] = useStoredKey(storageKey);

  const clearKey = useCallback(() => {
    setKey(null);
    onClear?.();
  }, [setKey, onClear]);

  const rejectionMessage = useCallback(
    (err: unknown): string | null => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearKey();
        return `Admin key rejected (${err.status}) — re-enter ${keyName}. If a fresh key still fails, sign out and back in.`;
      }
      return null;
    },
    [clearKey, keyName]
  );

  const promptNode = adminKey ? null : (
    <AdminKeyPrompt label={label} keyName={keyName} onSubmit={setKey} />
  );

  const actionNode = adminKey ? (
    <button type="button" className="btn btn-ghost btn-sm" onClick={clearKey}>
      Change key
    </button>
  ) : undefined;

  return { adminKey, promptNode, actionNode, rejectionMessage };
}
