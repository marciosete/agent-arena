import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { FeatureFlag, FlagKey } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { fetchFlags } from './api';
import { POLL } from './config';
import { usePoll } from './hooks';

interface FlagsState {
  flags: FeatureFlag[];
  /** false until the first successful read — routes wait rather than bounce. */
  ready: boolean;
}

const FlagsContext = createContext<FlagsState>({ flags: [], ready: false });

/** Poll the flags service so a flag flip reveals its feature within seconds, no reload. */
export function FlagsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { apiFetch, session } = useAuth();
  const load = useCallback(() => fetchFlags(apiFetch), [apiFetch]);
  const flags = usePoll(load, POLL.flags, session?.token);
  const value = useMemo(() => ({ flags: flags ?? [], ready: flags !== null }), [flags]);
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFlagsState(): FlagsState {
  return useContext(FlagsContext);
}

/**
 * Dark means absent — a feature renders only when its flag is on. Local dev
 * (`npm run dev`) shows everything so nobody flips a production flag to build.
 */
export function useFeature(key: FlagKey): boolean {
  const { flags } = useFlagsState();
  return import.meta.env.DEV || flags.some((flag) => flag.key === key && flag.enabled);
}
