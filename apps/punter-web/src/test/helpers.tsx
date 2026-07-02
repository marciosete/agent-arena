import { vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  FIXTURES,
  type Bet,
  type FeatureFlag,
  type Fixture,
  type Market,
  type SimState,
} from '@arena/contracts';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import App from '../App';

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

export function account(balance = 10_000) {
  return {
    id: ACCOUNT_ID,
    email: 'punter@example.com',
    name: 'Ana',
    balance,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
  };
}

/** Store a decodable, unexpired session the way @arena/web-auth expects it. */
export function seedSession(balance = 10_000): void {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  localStorage.setItem('arena.token', `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', exp })}.sig`);
  localStorage.setItem('arena.account', JSON.stringify(account(balance)));
}

export function flag(key: string, enabled = true): FeatureFlag {
  return { key, enabled, description: key, updatedAt: '2026-07-02T10:00:00.000Z' };
}

export const ALL_FLAGS = [
  'punter-markets',
  'punter-bet-slip',
  'punter-my-bets',
  'punter-bracket',
  'punter-confetti',
].map((key) => flag(key));

export function matchMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'R32-9',
    type: 'MATCH_WINNER',
    fixtureId: 'R32-9',
    name: 'Portugal v Croatia',
    status: 'open',
    selections: [
      { id: 'sel-por', name: 'Portugal', price: 1.8 },
      { id: 'sel-cro', name: 'Croatia', price: 2.1 },
    ],
    ...overrides,
  };
}

export function outrightMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'outright',
    type: 'OUTRIGHT',
    fixtureId: null,
    name: 'Tournament Winner',
    status: 'open',
    selections: [
      { id: 'out-esp', name: 'Spain', price: 4.5 },
      { id: 'out-fra', name: 'France', price: 6.0 },
    ],
    ...overrides,
  };
}

/** The seed with R32-9 played: POR win, propagated into R16-5 home (as the sim does). */
export function playedFixtures(): Fixture[] {
  return FIXTURES.map((fixture) => {
    if (fixture.id === 'R32-9') {
      return {
        ...fixture,
        status: 'finished' as const,
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: 'POR',
      };
    }
    if (fixture.id === 'R16-5') {
      return { ...fixture, homeTeamId: 'POR' };
    }
    return fixture;
  });
}

export function simState(fixtures: Fixture[] = FIXTURES, champion: string | null = null): SimState {
  const played = fixtures.filter((fixture) => fixture.status === 'finished');
  return {
    fixtures,
    champion,
    playedFixtureIds: played.map((fixture) => fixture.id),
    remainingFixtureIds: fixtures
      .filter((fixture) => fixture.status !== 'finished')
      .map((fixture) => fixture.id),
  };
}

export function bet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    accountId: ACCOUNT_ID,
    marketId: 'R32-9',
    selectionId: 'sel-por',
    stake: 100,
    price: 1.8,
    potentialReturn: 180,
    status: 'pending',
    placedAt: '2026-07-03T10:00:00.000Z',
    settledAt: null,
    ...overrides,
  };
}

type Payload = { status: number; body: unknown } | (() => unknown) | unknown;

export interface ServiceStubs {
  flags?: Payload;
  state?: Payload;
  markets?: Payload;
  /** GET /markets/:id — single-market lookup used by the 409 recovery flow */
  market?: Payload;
  outright?: Payload;
  bets?: Payload;
  placeBet?: Payload | Payload[];
  accountBalance?: number;
  health?: boolean;
}

function toResponse(payload: Payload): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  if (typeof payload === 'function') {
    return toResponse((payload as () => unknown)());
  }
  const shaped =
    payload !== null &&
    typeof payload === 'object' &&
    'status' in (payload as object) &&
    'body' in (payload as object)
      ? (payload as { status: number; body: unknown })
      : { status: 200, body: payload };
  return {
    ok: shaped.status >= 200 && shaped.status < 300,
    status: shaped.status,
    json: async () => shaped.body,
  };
}

/**
 * Route stubbed fetches by URL shape, matching how the app actually calls the
 * four services. `capture` records every (url, init) for header/body asserts.
 */
export function stubServices(stubs: ServiceStubs = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const placeQueue = Array.isArray(stubs.placeBet) ? [...stubs.placeBet] : null;

  const impl = async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/health')) {
      return toResponse(
        (stubs.health ?? true)
          ? { service: 'x', status: 'ok', time: '' }
          : { status: 500, body: {} }
      );
    }
    if (url.includes('/flags')) {
      return toResponse(stubs.flags ?? []);
    }
    if (url.includes('/state')) {
      return toResponse(stubs.state ?? simState());
    }
    if (url.includes('/outright')) {
      return toResponse(stubs.outright ?? outrightMarket());
    }
    if (/\/markets\/[^/]+$/.test(url)) {
      return toResponse(stubs.market ?? matchMarket());
    }
    if (url.includes('/markets')) {
      return toResponse(stubs.markets ?? [matchMarket()]);
    }
    if (url.includes('/bets') && init?.method === 'POST') {
      let next = stubs.placeBet;
      if (placeQueue) {
        // Drain the queue but keep replaying its last entry.
        next = placeQueue.length > 1 ? placeQueue.shift() : placeQueue[0];
      }
      return toResponse(next ?? bet());
    }
    if (url.includes('/bets')) {
      return toResponse(stubs.bets ?? []);
    }
    if (url.includes('/accounts/')) {
      return toResponse(account(stubs.accountBalance ?? 10_000));
    }
    return toResponse({ status: 404, body: {} });
  };

  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

export interface RenderAppOptions {
  path?: string;
  session?: boolean;
  balance?: number;
  requireAuth?: boolean;
}

/** Render the real App inside the real auth stack, at a path. */
export function renderApp({
  path = '/',
  session = true,
  balance = 10_000,
  requireAuth = false,
}: RenderAppOptions = {}) {
  if (session) {
    seedSession(balance);
  }
  window.history.pushState({}, '', path);
  const tree = requireAuth ? (
    <RequireAuth>
      <App />
    </RequireAuth>
  ) : (
    <App />
  );
  return render(<AuthProvider bettingUrl="http://localhost:4002">{tree}</AuthProvider>);
}
