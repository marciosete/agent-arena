import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import App from './App';
import { jsonResponse, renderWithAuth, TEST_BETTING_URL } from './test/helpers';

const NOW = '2026-07-03T10:00:00.000Z';

/** Contract-valid payloads for every read the console makes. */
const ROUTES: Array<{ suffix: string; body: unknown }> = [
  {
    suffix: '/exposure',
    body: {
      generatedAt: NOW,
      markets: [
        {
          marketId: 'r32-01',
          marketName: 'France v Argentina — Match Winner',
          totalStaked: 1200,
          maxLiability: 15000,
          betCount: 4,
          status: 'open',
        },
      ],
    },
  },
  {
    suffix: '/accounts',
    body: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: null,
        name: 'MartingaleBot',
        balance: 12000,
        isBot: true,
        createdAt: NOW,
      },
    ],
  },
  {
    suffix: '/markets',
    body: [
      {
        id: 'r32-01',
        type: 'MATCH_WINNER',
        fixtureId: 'r32-01',
        name: 'France v Argentina — Match Winner',
        status: 'open',
        selections: [
          { id: 'sel-fra', name: 'France', price: 1.8, probability: 0.55 },
          { id: 'sel-arg', name: 'Argentina', price: 2.2, probability: 0.45 },
        ],
      },
    ],
  },
  {
    suffix: '/state',
    body: { fixtures: [], champion: null, playedFixtureIds: [], remainingFixtureIds: [] },
  },
  {
    suffix: '/flags',
    body: [
      {
        key: 'punter-markets',
        enabled: false,
        description: 'Punter app: markets & odds board',
        updatedAt: NOW,
      },
    ],
  },
];

const READ_SUFFIXES = ROUTES.map((route) => route.suffix);

function stubAllReads(): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(async (url: string) => {
    const route = ROUTES.find((candidate) => new URL(url).pathname.endsWith(candidate.suffix));
    return route ? jsonResponse(route.body) : jsonResponse({ message: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

describe('App (DoD auth gates)', () => {
  beforeEach(() => {
    globalThis.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('an unauthenticated visit redirects to /login and makes no reads', async () => {
    const fetchSpy = stubAllReads();
    render(
      <AuthProvider bettingUrl={TEST_BETTING_URL}>
        <RequireAuth>
          <App />
        </RequireAuth>
      </AuthProvider>
    );
    expect(await screen.findByText('Sign in to Arena')).toBeTruthy();
    await waitFor(() => expect(globalThis.location.pathname).toBe('/login'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('every read (/exposure, /accounts, /markets, /state, /flags) carries the Bearer JWT via apiFetch', async () => {
    const fetchSpy = stubAllReads();
    renderWithAuth(<App />);
    await waitFor(() => {
      const calledPaths = fetchSpy.mock.calls.map(([url]) => new URL(url as string).pathname);
      for (const suffix of READ_SUFFIXES) {
        expect(calledPaths.some((path) => path.endsWith(suffix))).toBe(true);
      }
    });
    for (const [, init] of fetchSpy.mock.calls) {
      const auth = new Headers((init as RequestInit | undefined)?.headers).get('Authorization');
      expect(auth).toMatch(/^Bearer .+/);
    }
  });

  it('renders no wallet chip when there is no session (App outside RequireAuth)', async () => {
    stubAllReads();
    render(
      <AuthProvider bettingUrl={TEST_BETTING_URL}>
        <App />
      </AuthProvider>
    );
    expect(await screen.findByText(/arena/)).toBeTruthy();
    expect(screen.queryByText('Nadia')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('renders the console shell with the wallet chip for the signed-in trader', async () => {
    stubAllReads();
    renderWithAuth(<App />);
    expect(await screen.findByText('Nadia')).toBeTruthy();
    expect(screen.getByText(/arena/)).toBeTruthy();
    expect(screen.getByText('🍩 10,000')).toBeTruthy();
  });
});
