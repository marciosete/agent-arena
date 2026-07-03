import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FLAG_DEFINITIONS, FIXTURES } from '@arena/contracts';
import { AuthProvider } from '@arena/web-auth';
import App from './App';
import { jsonRes, renderAuthed, renderLoggedOut } from './__tests__/helpers';
import { SERVICE_URLS } from './lib/config';

const exposureReport = {
  generatedAt: '2026-07-03T10:00:00.000Z',
  markets: [
    {
      marketId: 'r32-1',
      marketName: 'Brazil v Chile',
      totalStaked: 1200,
      maxLiability: 6400,
      betCount: 8,
      status: 'open',
    },
  ],
};

const accounts = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: null,
    name: 'MartingaleMax',
    balance: 14_500,
    isBot: true,
    createdAt: '2026-07-01T09:00:00.000Z',
  },
];

const markets = [
  {
    id: 'r32-1',
    type: 'MATCH_WINNER',
    fixtureId: 'r32-1',
    name: 'Brazil v Chile — match winner',
    status: 'open',
    selections: [
      { id: 's1', name: 'Brazil', price: 1.55, probability: 0.62 },
      { id: 's2', name: 'Chile', price: 2.6, probability: 0.38 },
    ],
  },
];

const simState = {
  fixtures: FIXTURES,
  champion: null,
  playedFixtureIds: [],
  remainingFixtureIds: FIXTURES.map((f) => f.id),
};

const flags = FLAG_DEFINITIONS.map(({ key, description }) => ({
  key,
  description,
  enabled: false,
  updatedAt: '2026-07-03T09:00:00.000Z',
}));

/** Route every service read to a contract-valid payload, recording each call. */
function stubAllReads() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href.includes('/exposure')) return jsonRes(exposureReport);
      if (href.includes('/accounts')) return jsonRes(accounts);
      if (href.includes('/markets')) return jsonRes(markets);
      if (href.includes('/state')) return jsonRes(simState);
      if (href.includes('/flags')) return jsonRes(flags);
      return jsonRes({}, 404);
    })
  );
  return calls;
}

describe('App', () => {
  beforeEach(() => {
    globalThis.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('an unauthenticated visit redirects to /login and shows the login page', async () => {
    stubAllReads();
    renderLoggedOut(<App />);
    expect(await screen.findByText('Sign in to Arena')).toBeTruthy();
    await waitFor(() => expect(globalThis.location.pathname).toBe('/login'));
    expect(screen.queryByText('Release console')).toBeNull();
  });

  it('every read (/exposure, /accounts, /markets, /state, /flags) carries the Bearer JWT via apiFetch', async () => {
    const calls = stubAllReads();
    renderAuthed(<App />);

    const endpoints = [
      `${SERVICE_URLS.betting}/exposure`,
      `${SERVICE_URLS.betting}/accounts`,
      `${SERVICE_URLS.pricing}/markets`,
      `${SERVICE_URLS.simulator}/state`,
      `${SERVICE_URLS.flags}/flags`,
    ];
    await waitFor(() => {
      for (const endpoint of endpoints) {
        expect(calls.some((c) => c.url === endpoint)).toBe(true);
      }
    });
    for (const call of calls) {
      const auth = new Headers(call.init?.headers).get('Authorization');
      expect(auth, `missing Bearer on ${call.url}`).toMatch(/^Bearer .+/);
    }
  });

  it('renders the whole console: all six boards on one dense screen', async () => {
    stubAllReads();
    renderAuthed(<App />);
    expect(await screen.findByText('Release console')).toBeTruthy();
    for (const title of [
      'Exposure / liability',
      'Punter watchlist',
      'Market monitor',
      'Settlement feed',
      'Finale control',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Nadia')).toBeTruthy();
  });

  it('a 401 on a read ends the session and returns to the login page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'token expired' }, 401))
    );
    renderAuthed(<App />);
    // the session guard logs out and RequireAuth takes over — no frozen boards
    expect(await screen.findByText('Sign in to Arena')).toBeTruthy();
    expect(localStorage.getItem('arena.token')).toBeNull();
  });

  it('renders no wallet chip when there is no session', async () => {
    stubAllReads();
    render(
      <AuthProvider bettingUrl={SERVICE_URLS.betting}>
        <App />
      </AuthProvider>
    );
    expect(await screen.findByText('Release console')).toBeTruthy();
    expect(screen.queryByText('Log out')).toBeNull();
  });
});
