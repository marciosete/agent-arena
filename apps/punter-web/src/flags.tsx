import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { FeatureFlag, FlagKey } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { getFlags } from './api';
import { POLL_MS } from './config';
import { usePoll } from './hooks';

/** Named flag keys so features gate on one constant (the flag set is frozen in contracts). */
export const FLAGS = {
  markets: 'punter-markets',
  betSlip: 'punter-bet-slip',
  myBets: 'punter-my-bets',
  bracket: 'punter-bracket',
  confetti: 'punter-confetti',
} as const satisfies Record<string, FlagKey>;

const FlagsContext = createContext<FeatureFlag[]>([]);

/**
 * Polls the flags service so a flag flip reveals its feature within seconds, no
 * reload. Flags are FAIL-CLOSED: an unreachable flags service or a malformed
 * payload maps to the empty (all-dark) set rather than keeping a stale list —
 * the trader's kill switch must land even when flags dies right after the flip.
 */
export function FlagsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const apiFetch = useApi();
  const flags = usePoll(
    useCallback(async () => (await getFlags(apiFetch)) ?? [], [apiFetch]),
    POLL_MS.flags
  );
  const value = useMemo(() => flags ?? [], [flags]);
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

/**
 * Is a feature on? Local dev (`npm run dev`) shows everything so nobody flips a
 * production flag just to build; production gates strictly on the flag — dark
 * means absent. Vite sets `import.meta.env.DEV` true only in the dev server.
 */
export function useFlagOn(key: FlagKey): boolean {
  const flags = useContext(FlagsContext);
  return Boolean(import.meta.env.DEV) || flags.some((flag) => flag.key === key && flag.enabled);
}
