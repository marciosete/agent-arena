import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@arena/web-auth';
import { POLL_MS } from './config';

/**
 * Poll an async source on an interval, starting immediately. A `null` result
 * (service down / bad payload) keeps the last good value, so a wobbly backend
 * degrades to stale data instead of a blank screen. Two guards keep the data
 * honest and the tree quiet:
 *  - latest-issued-wins: a slow older response can never overwrite a newer one;
 *  - identical payloads are skipped, so unchanged polls cause no re-renders
 *    (which would otherwise reset hover/animation state every second).
 */
export function usePoll<T>(source: () => Promise<T | null>, intervalMs: number): T | null {
  const sourceRef = useRef(source);
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    let latestIssued = 0;
    let latestApplied = 0;
    let lastJson = '';
    const tick = async (): Promise<void> => {
      const issued = ++latestIssued;
      const next = await sourceRef.current();
      if (cancelled || next === null || issued < latestApplied) {
        return;
      }
      latestApplied = issued;
      const json = JSON.stringify(next);
      if (json === lastJson) {
        return;
      }
      lastJson = json;
      setValue(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return value;
}

/**
 * Keep the wallet chip live: re-read the account from betting on an interval,
 * so the balance jumps as settlements land during a sim run.
 */
export function useBalanceRefresh(intervalMs: number = POLL_MS.balance): void {
  const { refreshBalance } = useAuth();
  const refreshRef = useRef(refreshBalance);

  useEffect(() => {
    refreshRef.current = refreshBalance;
  }, [refreshBalance]);

  useEffect(() => {
    const timer = setInterval(() => {
      // refreshBalance rejects while betting is down mid-build — the next poll retries.
      refreshRef.current().catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
