import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  ACCOUNT,
  arenaAfterEach,
  authHeader,
  callsTo,
  flagsOn,
  marketFor,
  renderRoot,
  seedSession,
  simState,
  stubFetch,
} from './__tests__/harness';

afterEach(arenaAfterEach);

describe('auth (pre-built @arena/web-auth) — the app lives behind it', () => {
  it('no valid token ⇒ redirect to /login and the login screen (RequireAuth)', async () => {
    stubFetch({});
    renderRoot();
    expect(screen.getByText('Sign in to Arena')).toBeTruthy();
    await waitFor(() => expect(globalThis.location.pathname).toBe('/login'));
    // None of the gated app chrome leaks out to logged-out visitors.
    expect(screen.queryByLabelText('primary')).toBeNull();
    expect(screen.queryByText('ROAD TO THE FINAL')).toBeNull();
  });

  it('every service call carries the session Bearer via apiFetch', async () => {
    const token = seedSession();
    const mock = stubFetch({ state: simState(), markets: [marketFor('R32-9')] });
    renderRoot();
    await waitFor(() => {
      expect(callsTo(mock, '/flags').length).toBeGreaterThan(0);
      expect(callsTo(mock, '/state').length).toBeGreaterThan(0);
      expect(callsTo(mock, '/markets').length).toBeGreaterThan(0);
    });
    for (const endpoint of ['/flags', '/state', '/markets']) {
      for (const call of callsTo(mock, endpoint)) {
        expect(authHeader(call)).toBe(`Bearer ${token}`);
      }
    }
  });

  it('Log out clears the session and returns to /login', async () => {
    seedSession();
    stubFetch({ state: simState() });
    renderRoot();
    const chip = await screen.findByRole('button', { name: /Ana/ });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByText('Sign in to Arena')).toBeTruthy());
    expect(localStorage.getItem('arena.token')).toBeNull();
    await waitFor(() => expect(globalThis.location.pathname).toBe('/login'));
  });

  it('Switch punter also signs out (account persists server-side)', async () => {
    seedSession();
    stubFetch({ state: simState() });
    renderRoot();
    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch punter' }));
    await waitFor(() => expect(screen.getByText('Sign in to Arena')).toBeTruthy());
  });
});

describe('wallet chip', () => {
  it('shows the balance starting at 10,000 (OPENING_BALANCE from session.account)', async () => {
    seedSession();
    stubFetch({ state: simState() });
    renderRoot();
    expect(await screen.findByText('🍩 10,000')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('opens the profile menu with nickname, live balance and email', async () => {
    seedSession();
    stubFetch({ state: simState() });
    renderRoot();
    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    const menu = screen.getByRole('menu', { name: 'profile' });
    expect(menu.textContent).toContain('Ana');
    expect(menu.textContent).toContain('🍩 10,000');
    expect(menu.textContent).toContain('punter@example.com');
  });
});

describe('feature gating — production mode (DEV false): dark means absent', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    seedSession();
  });

  it('all flags dark ⇒ no nav, and home is the minimal hero (not the bracket)', async () => {
    const mock = stubFetch({ flags: [], state: simState() });
    renderRoot();
    await waitFor(() => expect(callsTo(mock, '/flags').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('primary')).toBeNull();
    expect(screen.getByText('Road to the Final')).toBeTruthy(); // hero title
    expect(screen.queryByRole('img', { name: 'Road to the Final bracket' })).toBeNull();
  });

  it('a flipped flag reveals exactly its feature', async () => {
    stubFetch({ flags: flagsOn('punter-markets', 'punter-bracket'), state: simState() });
    renderRoot();
    expect(await screen.findByText('Markets')).toBeTruthy();
    expect(screen.queryByText('My Bets')).toBeNull();
    expect(screen.queryByText('Bet Slip')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });
});

describe('feature gating — local dev (DEV true) shows everything', () => {
  it('renders every nav item and the bracket even with all flags dark', async () => {
    vi.stubEnv('DEV', true);
    seedSession();
    stubFetch({ flags: [], state: simState() });
    renderRoot();
    for (const label of ['Markets', 'Bet Slip', 'My Bets']) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });
});

describe('routes', () => {
  it('deep-links to /status survive the login bounce and show live health dots', async () => {
    seedSession();
    stubFetch({ state: simState() });
    globalThis.history.pushState({}, '', '/status');
    renderRoot();
    expect(await screen.findByText('Platform Status')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
  });

  it('marks services offline when their health checks fail', async () => {
    seedSession();
    stubFetch({ healthOk: false, state: simState() });
    globalThis.history.pushState({}, '', '/status');
    renderRoot();
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
  });

  it('/status stays reachable WITHOUT a session — outage reporting cannot sit behind login', async () => {
    stubFetch({});
    globalThis.history.pushState({}, '', '/status');
    renderRoot();
    expect(await screen.findByText('Platform Status')).toBeTruthy();
    expect(screen.queryByText('Sign in to Arena')).toBeNull();
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
  });

  it('navigates between pages through the flag-driven nav', async () => {
    vi.stubEnv('DEV', true);
    seedSession();
    stubFetch({ state: simState(), markets: [marketFor('R32-9')], bets: [] });
    renderRoot();
    fireEvent.click(await screen.findByText('Markets'));
    expect(await screen.findByRole('heading', { name: 'Markets' })).toBeTruthy();
    fireEvent.click(screen.getByText('My Bets'));
    expect(await screen.findByRole('heading', { name: 'My Bets' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('home'));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });

  it('a dark route falls back to home rather than rendering a stub', async () => {
    vi.stubEnv('DEV', false);
    seedSession();
    stubFetch({ flags: [], state: simState() });
    globalThis.history.pushState({}, '', '/markets');
    renderRoot();
    expect(await screen.findByText('Road to the Final')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Markets' })).toBeNull();
  });
});

describe('wallet balance updates after a bet (header ↔ betting account)', () => {
  it('refreshes the chip from GET /accounts/:id after placing a bet', async () => {
    vi.stubEnv('DEV', true);
    seedSession();
    stubFetch({
      state: simState(),
      markets: [marketFor('R32-9')],
      account: { ...ACCOUNT, balance: 9_900 },
      placeBetReplies: [
        {
          status: 201,
          body: {
            id: '44444444-4444-4444-8444-444444444444',
            accountId: ACCOUNT.id,
            marketId: 'R32-9',
            selectionId: 'sel-POR',
            stake: 100,
            price: 1.85,
            potentialReturn: 185,
            status: 'pending',
            placedAt: '2026-07-03T10:00:00.000Z',
            settledAt: null,
          },
        },
      ],
    });
    renderRoot();
    expect(await screen.findByText('🍩 10,000')).toBeTruthy();

    // Markets page → price button → slip → stake → place.
    fireEvent.click(await screen.findByText('Markets'));
    const priceButtons = await screen.findAllByRole('button', { name: /Portugal/ });
    fireEvent.click(priceButtons[0]);
    fireEvent.change(await screen.findByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));

    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());
    expect(await screen.findByText('🍩 9,900')).toBeTruthy();
  });
});
