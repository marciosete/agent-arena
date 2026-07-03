import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/api';

export interface Poll<T> {
  /** Last successful payload — kept on error so a blip never blanks a board. */
  data: T | null;
  /** Human-readable failure from the most recent attempt, or null when healthy. */
  error: string | null;
  /** Epoch ms of the last successful fetch — drives the auto-refresh indicator. */
  updatedAt: number | null;
  /** Force an immediate re-poll (e.g. right after a mutation). */
  refresh: () => void;
}

/**
 * Poll `fetcher` every `intervalMs`, starting immediately. The fetcher must be
 * referentially stable (wrap it in `useCallback`) — a new identity restarts the loop.
 * Ticks are sequenced: a slow response that resolves after a newer one already
 * landed is discarded, so stale data can never overwrite fresh data (nor stamp
 * itself as just-updated). `onError` (also stable) fires on every applied failure —
 * callers use it to end the session on a 401.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  onError?: (err: unknown) => void
): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let issued = 0;
    let applied = 0;

    async function tick(): Promise<void> {
      const seq = ++issued;
      try {
        const next = await fetcher();
        if (!cancelled && seq > applied) {
          applied = seq;
          setData(next);
          setError(null);
          setUpdatedAt(Date.now());
        }
      } catch (err) {
        if (!cancelled && seq > applied) {
          applied = seq;
          setError(errorMessage(err));
          onError?.(err);
        }
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetcher, intervalMs, nonce, onError]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, updatedAt, refresh };
}
