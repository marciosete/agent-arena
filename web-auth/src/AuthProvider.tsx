import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccountSchema, AuthResponseSchema, type Account } from '@arena/contracts';
import { isTokenValid } from './jwt';

/** A live authenticated session: the bearer token plus the account it belongs to. */
export interface Session {
  token: string;
  account: Account;
}

/** Everything `useAuth()` exposes to consuming apps. */
export interface AuthContextValue {
  /** The current session, or `null` when logged out. */
  session: Session | null;
  /** Email a fresh 6-digit code (step 1 of passwordless login). */
  requestOtp: (email: string) => Promise<void>;
  /** Verify a code (with an optional nickname for brand-new accounts) and store the session. */
  verify: (email: string, code: string, name?: string) => Promise<void>;
  /** Clear the session and wipe it from storage. */
  logout: () => void;
  /** Re-read the account (balance) from the betting service; a 401 logs the user out. */
  refreshBalance: () => Promise<void>;
  /**
   * `fetch` that attaches `Authorization: Bearer <token>` whenever a session
   * exists. A path (e.g. `/bets`) is resolved against the betting service; a
   * fully-qualified URL is used as-is. Pass `{ retry: true }` for one-shot,
   * idempotent actions (e.g. placing a bet) to transparently retry transient
   * gateway failures (502/503/504, cold starts). Polling reads should NOT retry
   * — the next poll recovers — so retry is off by default.
   */
  apiFetch: (path: string, init?: RequestInit, opts?: { retry?: boolean }) => Promise<Response>;
  /** The betting-service base URL this provider was configured with. */
  bettingUrl: string;
}

const TOKEN_KEY = 'arena.token';
const ACCOUNT_KEY = 'arena.account';

const AuthContext = createContext<AuthContextValue | null>(null);

/** Restore a session from storage, discarding anything expired or corrupt. */
function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawAccount = localStorage.getItem(ACCOUNT_KEY);
    if (!token || !rawAccount || !isTokenValid(token)) {
      return null;
    }
    return { token, account: AccountSchema.parse(JSON.parse(rawAccount)) };
  } catch {
    return null;
  }
}

/** Mirror a session (or its absence) into `localStorage`. */
function persist(session: Session | null): void {
  try {
    if (session) {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session.account));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    /* storage may be unavailable (private mode / quota) — session still works in memory */
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Gateway/proxy statuses that mean "not the app's answer, try again" — a Render free-tier
 * cold start surfaces as one of these (or a thrown network error). */
const TRANSIENT_STATUS = new Set([502, 503, 504]);
/** Backoff before each retry, indexed by attempt; its length caps the number of retries. */
const RETRY_DELAYS_MS = [300, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * `fetch` that transparently retries transient gateway failures (502/503/504 or a thrown
 * network error) with a short backoff. Safe for every call the apps make: reads are
 * idempotent, and `POST /bets` carries an `idempotencyKey` — so a retried bet that the
 * server had already processed returns the original bet, never a double debit. Real
 * application responses (400/401/409/500/…) are returned immediately, never retried.
 */
async function fetchWithRetry(input: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    const response = await fetch(input, init);
    if (!TRANSIENT_STATUS.has(response.status) || attempt >= RETRY_DELAYS_MS.length) {
      return response;
    }
  } catch (error) {
    if (attempt >= RETRY_DELAYS_MS.length) {
      throw error;
    }
  }
  await sleep(RETRY_DELAYS_MS[attempt]);
  return fetchWithRetry(input, init, attempt + 1);
}

export interface AuthProviderProps {
  bettingUrl: string;
  children: ReactNode;
}

export function AuthProvider({ bettingUrl, children }: Readonly<AuthProviderProps>) {
  const [session, setSession] = useState<Session | null>(null);

  const applySession = useCallback((next: Session | null) => {
    persist(next);
    setSession(next);
  }, []);

  // On mount, restore a valid session — or drop an expired/corrupt one from storage.
  useEffect(() => {
    const restored = loadSession();
    if (restored) {
      setSession(restored);
    } else {
      persist(null);
    }
  }, []);

  const requestOtp = useCallback(
    async (email: string) => {
      const res = await postJson(`${bettingUrl}/auth/request-otp`, { email });
      if (!res.ok) {
        throw new Error('We could not send a code right now. Please try again in a moment.');
      }
    },
    [bettingUrl]
  );

  const verify = useCallback(
    async (email: string, code: string, name?: string) => {
      const trimmed = name?.trim();
      const body = trimmed ? { email, code, name: trimmed } : { email, code };
      const res = await postJson(`${bettingUrl}/auth/verify`, body);
      if (!res.ok) {
        throw new Error("That code didn't work — check it or resend.");
      }
      const { token, account } = AuthResponseSchema.parse(await res.json());
      applySession({ token, account });
    },
    [bettingUrl, applySession]
  );

  const logout = useCallback(() => applySession(null), [applySession]);

  const apiFetch = useCallback(
    (path: string, init: RequestInit = {}, opts: { retry?: boolean } = {}) => {
      const headers = new Headers(init.headers);
      if (session) {
        headers.set('Authorization', `Bearer ${session.token}`);
      }
      const url = path.startsWith('http') ? path : `${bettingUrl}${path}`;
      const request = { ...init, headers };
      // Retry only when the caller opts in (idempotent one-shots like bet placement);
      // polling reads stay single-shot so an outage surfaces immediately.
      return opts.retry ? fetchWithRetry(url, request) : fetch(url, request);
    },
    [session, bettingUrl]
  );

  const refreshBalance = useCallback(async () => {
    if (!session) {
      return;
    }
    const res = await apiFetch(`/accounts/${session.account.id}`);
    if (res.status === 401) {
      applySession(null);
      return;
    }
    if (!res.ok) {
      return;
    }
    const account = AccountSchema.parse(await res.json());
    applySession({ token: session.token, account });
  }, [session, apiFetch, applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, requestOtp, verify, logout, refreshBalance, apiFetch, bettingUrl }),
    [session, requestOtp, verify, logout, refreshBalance, apiFetch, bettingUrl]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the auth context. Throws if used outside an `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be used within an <AuthProvider>.');
  }
  return ctx;
}

/** Convenience hook returning just the session-bound `apiFetch`. */
export function useApi(): AuthContextValue['apiFetch'] {
  return useAuth().apiFetch;
}
