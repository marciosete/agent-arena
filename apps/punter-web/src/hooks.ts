import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@arena/web-auth';

/**
 * Poll a loader on an interval, keeping the last good value: a `null` result
 * (service down / bad payload) never wipes what the screen already shows.
 * The loader is read through a ref so a new identity (e.g. `apiFetch` after a
 * balance refresh) doesn't restart the interval or double-fetch. `resetKey`
 * is the deliberate exception: key it to the session token so polls re-fire
 * the instant a session appears (restore or fresh login) instead of waiting
 * out the interval with a tokenless first call.
 */
export function usePoll<T>(
  load: () => Promise<T | null>,
  intervalMs: number,
  resetKey?: unknown
): T | null {
  const [value, setValue] = useState<T | null>(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await loadRef.current();
      if (!cancelled && next !== null) {
        setValue(next);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, resetKey]);

  return value;
}

/**
 * Keep the wallet honest: re-read the account on a heartbeat so settlements
 * during a sim run move the header balance without any user action. web-auth's
 * refreshBalance also drops the session on a 401 (expired token → /login).
 */
export function useBalanceHeartbeat(intervalMs: number): void {
  const { refreshBalance } = useAuth();
  const refreshRef = useRef(refreshBalance);

  useEffect(() => {
    refreshRef.current = refreshBalance;
  }, [refreshBalance]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshRef.current().catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
