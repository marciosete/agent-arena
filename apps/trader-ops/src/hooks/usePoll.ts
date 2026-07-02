import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResult } from '../lib/api';

export interface PollState<T> {
  /** Last good payload — kept through later failures so the board degrades, never blanks. */
  data: T | null;
  /** Human message for the current failure; null while the last poll succeeded. */
  error: string | null;
  /** HTTP status of the current failure (401 vs 403 matter to the admin panels). */
  errorStatus: number | null;
  /** ISO time of the last successful poll — the panel's "live" tick. */
  lastUpdatedAt: string | null;
  /** Fetch immediately (e.g. right after a mutation) without waiting for the interval. */
  refresh: () => Promise<void>;
}

/**
 * Poll `fetcher` immediately and then every `intervalMs`. The fetcher must be
 * referentially stable (wrap it in `useCallback`) or the interval resets on
 * every render.
 */
export function usePoll<T>(fetcher: () => Promise<ApiResult<T>>, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const result = await fetcher();
    if (!alive.current) {
      return;
    }
    if (result.ok) {
      setData(result.data);
      setError(null);
      setErrorStatus(null);
      setLastUpdatedAt(new Date().toISOString());
    } else {
      setError(result.message);
      setErrorStatus(result.status);
    }
  }, [fetcher]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, error, errorStatus, lastUpdatedAt, refresh };
}
