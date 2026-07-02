import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ALL_FLAGS, flag, renderApp, stubServices } from './test/helpers';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

describe('auth gate — pre-built RequireAuth, never re-implemented', () => {
  it('redirects to /login when there is no valid token', async () => {
    stubServices();
    renderApp({ session: false, requireAuth: true });
    expect(screen.getByText('Sign in to Arena')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('logs out from the profile menu, clears the session, and returns to /login', async () => {
    stubServices();
    renderApp({ requireAuth: true });
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByText('Sign in to Arena')).toBeTruthy());
    expect(localStorage.getItem('arena.token')).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('"Switch punter" also signs out to the login screen', async () => {
    stubServices();
    renderApp({ requireAuth: true });
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch punter' }));
    await waitFor(() => expect(screen.getByText('Sign in to Arena')).toBeTruthy());
  });

  it('attaches the session Bearer to every service call via apiFetch', async () => {
    const { calls } = stubServices();
    renderApp();
    const token = localStorage.getItem('arena.token');
    const bearerCallTo = (surface: string) =>
      calls.some(
        (entry) =>
          entry.url.endsWith(surface) &&
          new Headers(entry.init?.headers).get('Authorization') === `Bearer ${token}`
      );
    // The session restores in an AuthProvider effect; polls re-fire with the
    // Bearer the moment it lands (usePoll resetKey) — assert on those calls.
    await waitFor(() => {
      for (const surface of ['/flags', '/state', '/markets']) {
        expect(bearerCallTo(surface), `expected a Bearer call to ${surface}`).toBe(true);
      }
    });
  });
});

describe('header wallet chip', () => {
  it('shows the opening balance of 10,000 donut dollars with the nickname', () => {
    stubServices();
    renderApp();
    expect(screen.getByText('🍩 10,000')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('opens a profile menu with nickname + live balance, closing on outside click', async () => {
    stubServices();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    expect(screen.getByRole('menu', { name: 'profile' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'profile' })).toBeNull());
  });
});

describe('feature gating — production (DEV false, flags decide)', () => {
  it('hides the nav and shows the minimal hero while every feature is dark', async () => {
    vi.stubEnv('DEV', false);
    const { calls } = stubServices({ flags: [] });
    renderApp();
    await waitFor(() => expect(calls.some((entry) => entry.url.includes('/flags'))).toBe(true));
    expect(screen.queryByLabelText('primary')).toBeNull();
    expect(screen.getByText('The World Cup knockout stage.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Road to the Final bracket' })).toBeNull();
  });

  it('reveals nav items as their flags flip on', async () => {
    vi.stubEnv('DEV', false);
    stubServices({ flags: [flag('punter-markets'), flag('punter-my-bets')] });
    renderApp();
    await waitFor(() => expect(screen.getByText('Markets')).toBeTruthy());
    expect(screen.getByText('My Bets')).toBeTruthy();
    expect(screen.queryByText('Bet Slip')).toBeNull();
  });

  it('reveals the bracket on / when punter-bracket flips on', async () => {
    vi.stubEnv('DEV', false);
    stubServices({ flags: [flag('punter-bracket')] });
    renderApp();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });

  it('bounces a deep link to a dark feature back home once flags load', async () => {
    vi.stubEnv('DEV', false);
    stubServices({ flags: [flag('punter-markets', false)] });
    renderApp({ path: '/markets' });
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.getByText('The World Cup knockout stage.')).toBeTruthy();
  });
});

describe('feature gating — local dev bypass (DEV true)', () => {
  it('shows every feature even with all flags dark', async () => {
    vi.stubEnv('DEV', true);
    stubServices({ flags: [] });
    renderApp();
    for (const label of ['Markets', 'Bet Slip', 'My Bets']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });
});

describe('client-side routing', () => {
  it('navigates from the nav to /markets without a reload', async () => {
    vi.stubEnv('DEV', true);
    stubServices({ flags: ALL_FLAGS });
    renderApp();
    fireEvent.click(screen.getByText('Markets'));
    expect(window.location.pathname).toBe('/markets');
    await waitFor(() => expect(screen.getByText('Round of 32')).toBeTruthy());
  });

  it('keeps native behaviour for modified clicks (cmd-click opens a tab)', () => {
    vi.stubEnv('DEV', true);
    stubServices();
    renderApp();
    fireEvent.click(screen.getByText('Markets'), { metaKey: true });
    expect(window.location.pathname).toBe('/');
  });

  it('follows browser history (popstate) back to a previous page', async () => {
    vi.stubEnv('DEV', true);
    stubServices();
    renderApp();
    fireEvent.click(screen.getByText('My Bets'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Bets' })).toBeTruthy());
    window.history.pushState({}, '', '/');
    fireEvent.popState(window);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
  });
});

describe('status page', () => {
  it('shows every service online when health checks succeed', async () => {
    stubServices();
    renderApp({ path: '/status' });
    expect(screen.getByText('Platform Status')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
  });

  it('shows services offline when health checks fail', async () => {
    stubServices({ health: false });
    renderApp({ path: '/status' });
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
  });
});
