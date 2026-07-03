import { vi } from 'vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  FIXTURES,
  FLAG_DEFINITIONS,
  type Fixture,
  type Market,
  type SimState,
} from '@arena/contracts';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import { Root } from '../App';
import { FlagsProvider } from '../flags';
import { BetSlipDrawer, SlipProvider } from '../slip';

/* ── Session ───────────────────────────────────────────────────────── */

export const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'punter@example.com',
  name: 'Ana',
  balance: 10_000,
  isBot: false,
  createdAt: '2026-07-01T10:00:00.000Z',
};

const b64url = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

export function fakeJwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub: ACCOUNT.id, exp })}.sig`;
}

export function seedSession(account: typeof ACCOUNT = ACCOUNT): string {
  const token = fakeJwt();
  localStorage.setItem('arena.token', token);
  localStorage.setItem('arena.account', JSON.stringify(account));
  return token;
}

/* ── Data builders ─────────────────────────────────────────────────── */

export const ALL_FLAGS_ON = FLAG_DEFINITIONS.map((definition) => ({
  key: definition.key,
  enabled: true,
  description: definition.description,
  updatedAt: '2026-07-02T10:00:00.000Z',
}));

export function flagsOn(...keys: string[]) {
  return ALL_FLAGS_ON.map((flag) => ({ ...flag, enabled: keys.includes(flag.key) }));
}

/** The real seed bracket, cloned so tests can mutate results into it. */
export function cloneFixtures(): Fixture[] {
  return structuredClone(FIXTURES);
}

/**
 * The bracket with NOTHING played — a deterministic baseline that stays valid
 * as real results land in the seed (results reset, propagated winners cleared
 * from fed slots; structural entries like CAN in R16-1 are kept).
 */
export function pristineFixtures(): Fixture[] {
  const fixtures = cloneFixtures();
  const fedSlots = new Set(
    fixtures
      .filter((fixture) => fixture.feedsInto && fixture.feedsIntoSlot)
      .map((fixture) => `${fixture.feedsInto}:${fixture.feedsIntoSlot}`)
  );
  for (const fixture of fixtures) {
    fixture.status = 'scheduled';
    fixture.homeScore = null;
    fixture.awayScore = null;
    fixture.winnerTeamId = null;
    if (fedSlots.has(`${fixture.id}:home`)) {
      fixture.homeTeamId = null;
    }
    if (fedSlots.has(`${fixture.id}:away`)) {
      fixture.awayTeamId = null;
    }
  }
  return fixtures;
}

/** A SimState where POR beat CRO 2–1 in R32-9 and advanced into R16-5 (home). */
export function simStateWithResult(): SimState {
  const fixtures = pristineFixtures();
  const played = fixtures.find((fixture) => fixture.id === 'R32-9') as Fixture;
  played.status = 'finished';
  played.homeScore = 2;
  played.awayScore = 1;
  played.winnerTeamId = 'POR';
  const next = fixtures.find((fixture) => fixture.id === 'R16-5') as Fixture;
  next.homeTeamId = 'POR';
  return {
    fixtures,
    champion: null,
    playedFixtureIds: ['R32-9'],
    remainingFixtureIds: fixtures.filter((f) => f.status !== 'finished').map((f) => f.id),
  };
}

/** What the simulator would serve at boot: the seed exactly as shipped. */
export function simStateLive(): SimState {
  const fixtures = cloneFixtures();
  return {
    fixtures,
    champion: null,
    playedFixtureIds: fixtures.filter((f) => f.status === 'finished').map((f) => f.id),
    remainingFixtureIds: fixtures.filter((f) => f.status !== 'finished').map((f) => f.id),
  };
}

export function simState(overrides: Partial<SimState> = {}): SimState {
  return {
    fixtures: pristineFixtures(),
    champion: null,
    playedFixtureIds: [],
    remainingFixtureIds: FIXTURES.map((fixture) => fixture.id),
    ...overrides,
  };
}

export function marketFor(
  fixtureId: string,
  overrides: Partial<Market> = {},
  prices: [number, number] = [1.85, 2.1]
): Market {
  return {
    id: fixtureId,
    type: 'MATCH_WINNER',
    fixtureId,
    name: 'Portugal v Croatia',
    status: 'open',
    selections: [
      { id: 'sel-POR', name: 'Portugal', price: prices[0] },
      { id: 'sel-CRO', name: 'Croatia', price: prices[1] },
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
      { id: 'out-FRA', name: 'France', price: 4.2 },
      { id: 'out-BRA', name: 'Brazil', price: 5.0 },
      { id: 'out-POR', name: 'Portugal', price: 8.5 },
    ],
    ...overrides,
  };
}

/* ── Fetch stub ────────────────────────────────────────────────────── */

export interface RouteReply {
  status?: number;
  body?: unknown;
}

export interface StubOptions {
  rejectAll?: boolean;
  healthOk?: boolean;
  flags?: unknown;
  state?: unknown;
  /** `undefined` body → the route answers 503 (service still being built). */
  stateDown?: boolean;
  markets?: unknown;
  outright?: unknown;
  bets?: unknown;
  account?: unknown;
  /** Consumed one per POST /bets; the last entry repeats. */
  placeBetReplies?: RouteReply[];
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function stubFetch(options: StubOptions = {}) {
  const placeBetQueue = [...(options.placeBetReplies ?? [])];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (options.rejectAll) {
      throw new Error('service down');
    }
    const url = String(input);
    return (
      routePlatform(url, options) ??
      routePricing(url, options) ??
      routeBetting(url, init, options, placeBetQueue) ??
      json({ message: 'unmatched route in test stub' }, 404)
    );
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function routePlatform(url: string, options: StubOptions): Response | null {
  if (url.endsWith('/health')) {
    return json({}, options.healthOk === false ? 503 : 200);
  }
  if (url.endsWith('/flags')) {
    return json(options.flags ?? []);
  }
  if (url.endsWith('/state')) {
    return options.stateDown ? json({}, 503) : json(options.state ?? simState());
  }
  return null;
}

function routePricing(url: string, options: StubOptions): Response | null {
  if (url.endsWith('/outright')) {
    return json(options.outright ?? outrightMarket());
  }
  if (url.includes('/markets/')) {
    const id = url.slice(url.lastIndexOf('/') + 1);
    const all = (options.markets as Market[] | undefined) ?? [];
    const found = all.find((market) => market.id === id);
    return found ? json(found) : json({ message: 'not found' }, 404);
  }
  if (url.endsWith('/markets')) {
    return json(options.markets ?? []);
  }
  return null;
}

function routeBetting(
  url: string,
  init: RequestInit | undefined,
  options: StubOptions,
  placeBetQueue: RouteReply[]
): Response | null {
  if (url.includes('/bets') && init?.method === 'POST') {
    const reply = placeBetQueue.length > 1 ? placeBetQueue.shift() : placeBetQueue[0];
    return json(reply?.body ?? {}, reply?.status ?? 500);
  }
  if (url.includes('/bets')) {
    return json(options.bets ?? []);
  }
  if (url.includes('/accounts/')) {
    return json(options.account ?? ACCOUNT);
  }
  return null;
}

type FetchMock = ReturnType<typeof stubFetch>;
type FetchCall = [RequestInfo | URL, RequestInit | undefined];

export function callsTo(mock: FetchMock, needle: string): FetchCall[] {
  return (mock.mock.calls as FetchCall[]).filter(([input]) => String(input).includes(needle));
}

export function authHeader(call: FetchCall): string | null {
  return new Headers(call[1]?.headers).get('authorization');
}

export function postedBody(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

/* ── Renderers ─────────────────────────────────────────────────────── */

/** The full app exactly as `main.tsx` mounts it. */
export function renderRoot(): RenderResult {
  return render(<Root />);
}

/** A page or view behind the real auth + flags + slip providers (drawer included). */
export function renderWithProviders(ui: ReactNode): RenderResult {
  return render(
    <AuthProvider bettingUrl="http://localhost:4002">
      <RequireAuth>
        <FlagsProvider>
          <SlipProvider>
            {ui}
            <BetSlipDrawer />
          </SlipProvider>
        </FlagsProvider>
      </RequireAuth>
    </AuthProvider>
  );
}

/** Shared afterEach: unmount, wipe storage/stubs, reset the URL. */
export function arenaAfterEach(): void {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  globalThis.history.pushState({}, '', '/');
}
