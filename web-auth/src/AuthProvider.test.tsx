import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthProvider';

const BETTING_URL = 'http://betting.test';

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'punter@example.com',
  name: 'Ada',
  balance: 10_000,
  isBot: false,
  createdAt: '2026-07-01T10:00:00.000Z',
};

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function makeToken(offsetSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + offsetSeconds;
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u', exp })}.sig`;
}
const VALID_TOKEN = makeToken(3600);

function res(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response);
}

function seedStorage(token: string): void {
  localStorage.setItem('arena.token', token);
  localStorage.setItem('arena.account', JSON.stringify(ACCOUNT));
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider bettingUrl={BETTING_URL}>{children}</AuthProvider>;
}

function Probe() {
  const { session, verify, logout, refreshBalance, apiFetch } = useAuth();
  return (
    <div>
      <span data-testid="token">{session?.token ?? 'none'}</span>
      <span data-testid="balance">{session ? String(session.account.balance) : 'none'}</span>
      <button type="button" onClick={() => void verify('a@b.com', '123456', 'Nick')}>
        verify
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
      <button type="button" onClick={() => void refreshBalance()}>
        refresh
      </button>
      <button type="button" onClick={() => void apiFetch('/bets')}>
        call
      </button>
      <button type="button" onClick={() => void apiFetch('http://abs.test/ping')}>
        callAbs
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider bettingUrl={BETTING_URL}>
      <Probe />
    </AuthProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('session restore on mount', () => {
  it('restores a valid session from localStorage', async () => {
    seedStorage(VALID_TOKEN);
    vi.stubGlobal('fetch', vi.fn());
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe(VALID_TOKEN));
    expect(screen.getByTestId('balance').textContent).toBe('10000');
  });

  it('drops an EXPIRED token on mount and clears storage', async () => {
    seedStorage(makeToken(-10));
    vi.stubGlobal('fetch', vi.fn());
    renderProbe();
    await waitFor(() => expect(localStorage.getItem('arena.token')).toBeNull());
    expect(screen.getByTestId('token').textContent).toBe('none');
  });
});

describe('verify + logout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) =>
        String(input).endsWith('/auth/verify')
          ? res({ token: VALID_TOKEN, account: ACCOUNT })
          : res({})
      )
    );
  });

  it('verify stores the session in state and localStorage', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe(VALID_TOKEN));
    expect(localStorage.getItem('arena.token')).toBe(VALID_TOKEN);
    expect(JSON.parse(localStorage.getItem('arena.account') ?? '{}').name).toBe('Ada');
  });

  it('logout clears the session and storage', async () => {
    renderProbe();
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe(VALID_TOKEN));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('none'));
    expect(localStorage.getItem('arena.token')).toBeNull();
  });
});

describe('apiFetch', () => {
  it('attaches a Bearer header once a session exists, resolving paths against the betting URL', async () => {
    const fetchMock = vi.fn((input: unknown, _init?: unknown) =>
      String(input).endsWith('/auth/verify')
        ? res({ token: VALID_TOKEN, account: ACCOUNT })
        : res({})
    );
    vi.stubGlobal('fetch', fetchMock);
    renderProbe();

    fireEvent.click(screen.getByText('call')); // logged out
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe(VALID_TOKEN));
    fireEvent.click(screen.getByText('call')); // logged in

    const betCalls = fetchMock.mock.calls.filter(([url]) => String(url) === `${BETTING_URL}/bets`);
    expect(betCalls).toHaveLength(2);
    const header = (init: unknown) =>
      new Headers((init as RequestInit).headers).get('Authorization');
    expect(header(betCalls[0][1])).toBeNull();
    expect(header(betCalls[1][1])).toBe(`Bearer ${VALID_TOKEN}`);
  });

  it('uses a fully-qualified URL as-is', async () => {
    const fetchMock = vi.fn((_input?: unknown, _init?: unknown) => res({}));
    vi.stubGlobal('fetch', fetchMock);
    renderProbe();
    fireEvent.click(screen.getByText('callAbs'));
    expect(fetchMock.mock.calls.some(([url]) => String(url) === 'http://abs.test/ping')).toBe(true);
  });

  it('retries a transient 502 (cold start) and returns the eventual success', async () => {
    seedStorage(VALID_TOKEN);
    let betHits = 0;
    const fetchMock = vi.fn((input: unknown, _init?: unknown) => {
      if (String(input) === `${BETTING_URL}/bets`) {
        betHits += 1;
        return betHits === 1 ? res({}, { ok: false, status: 502 }) : res({ id: 'bet-1' });
      }
      return res({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    let response!: Response;
    await act(async () => {
      response = await result.current.apiFetch('/bets', { method: 'POST' }, { retry: true });
    });
    expect(response.status).toBe(200);
    expect(betHits).toBe(2); // retried the 502 once
  });

  it('does NOT retry an application error like 409 (price moved)', async () => {
    seedStorage(VALID_TOKEN);
    let betHits = 0;
    const fetchMock = vi.fn((input: unknown, _init?: unknown) => {
      if (String(input) === `${BETTING_URL}/bets`) {
        betHits += 1;
        return res({}, { ok: false, status: 409 });
      }
      return res({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    let response!: Response;
    await act(async () => {
      response = await result.current.apiFetch('/bets', { method: 'POST' }, { retry: true });
    });
    expect(response.status).toBe(409);
    expect(betHits).toBe(1); // no retry — the app answered, fail fast
  });

  it('retries a thrown network error, then surfaces it if every attempt fails', async () => {
    seedStorage(VALID_TOKEN);
    let betHits = 0;
    const fetchMock = vi.fn((input: unknown, _init?: unknown) => {
      if (String(input) === `${BETTING_URL}/bets`) {
        betHits += 1;
        return Promise.reject(new Error('network down'));
      }
      return res({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await expect(
        result.current.apiFetch('/bets', { method: 'POST' }, { retry: true })
      ).rejects.toThrow(/network down/);
    });
    expect(betHits).toBe(3); // initial try + 2 retries, then it gives up
  });
});

describe('refreshBalance', () => {
  it('updates the balance from the betting service', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url.endsWith('/auth/verify')) return res({ token: VALID_TOKEN, account: ACCOUNT });
      if (url.includes('/accounts/')) return res({ ...ACCOUNT, balance: 9_500 });
      return res({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProbe();
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('balance').textContent).toBe('10000'));
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('balance').textContent).toBe('9500'));
  });

  it('logs out on a 401', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url.endsWith('/auth/verify')) return res({ token: VALID_TOKEN, account: ACCOUNT });
      if (url.includes('/accounts/')) return res({}, { ok: false, status: 401 });
      return res({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProbe();
    fireEvent.click(screen.getByText('verify'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe(VALID_TOKEN));
    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('none'));
  });

  it('is a no-op when logged out', async () => {
    const fetchMock = vi.fn((_input?: unknown, _init?: unknown) => res({}));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.refreshBalance();
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/accounts/'))).toBe(false);
  });
});

describe('hook contract', () => {
  it('requestOtp rejects with a friendly message when the service is unhappy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => res({}, { ok: false, status: 500 }))
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await expect(result.current.requestOtp('a@b.com')).rejects.toThrow(/could not send a code/i);
  });

  it('verify omits the nickname when none is supplied', async () => {
    const fetchMock = vi.fn((_input?: unknown, _init?: unknown) =>
      res({ token: VALID_TOKEN, account: ACCOUNT })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.verify('a@b.com', '123456');
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ email: 'a@b.com', code: '123456' });
  });

  it('useAuth throws outside of a provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/within an <AuthProvider>/);
  });
});
