import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const FLAG_FIXTURE = [
  {
    key: 'punter-markets',
    enabled: true,
    description: 'markets',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  {
    key: 'punter-bet-slip',
    enabled: false,
    description: 'bet slip',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  {
    key: 'punter-bracket',
    enabled: true,
    description: 'bracket',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
];

function stubFetch(options: {
  reject?: boolean;
  healthOk?: boolean;
  flagsOk?: boolean;
  flags?: unknown;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: unknown) => {
      if (options.reject) {
        return Promise.reject(new Error('service down'));
      }
      if (String(input).endsWith('/flags')) {
        return Promise.resolve({
          ok: options.flagsOk ?? true,
          json: async () => options.flags ?? [],
        });
      }
      return Promise.resolve({ ok: options.healthOk ?? true });
    })
  );
}

describe('home page — production flag gating (DEV false)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  beforeEach(() => {
    vi.stubEnv('DEV', false);
  });

  it('renders the hero with no nav while every feature is dark', async () => {
    stubFetch({ flags: [] });
    render(<App />);
    expect(screen.getByText('Road to the Final')).toBeTruthy();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('primary')).toBeNull();
    expect(screen.queryByText('online')).toBeNull();
  });

  it('shows nav items only for enabled flags', async () => {
    stubFetch({ flags: FLAG_FIXTURE });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Markets')).toBeTruthy());
    expect(screen.getByText('Bracket')).toBeTruthy();
    expect(screen.queryByText('Bet Slip')).toBeNull();
    expect(screen.queryByText('My Bets')).toBeNull();
  });

  it('hides the nav when the flag service is unreachable', async () => {
    stubFetch({ reject: true });
    render(<App />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('primary')).toBeNull();
  });

  it('hides the nav when the flag payload is malformed', async () => {
    stubFetch({ flags: [{ nope: true }] });
    render(<App />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('primary')).toBeNull();
  });
});

describe('home page — local dev bypass (DEV true)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('shows every feature regardless of flags', async () => {
    vi.stubEnv('DEV', true);
    stubFetch({ flags: [] }); // all dark
    render(<App />);
    await waitFor(() => expect(screen.getByText('Markets')).toBeTruthy());
    for (const label of ['Markets', 'Bet Slip', 'My Bets', 'Bracket']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('status page', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('shows every service online when health checks succeed', async () => {
    stubFetch({});
    window.history.pushState({}, '', '/status');
    render(<App />);
    expect(screen.getByText('Platform Status')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
  });

  it('shows services offline when health checks are rejected', async () => {
    stubFetch({ reject: true });
    window.history.pushState({}, '', '/status');
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
  });

  it('shows services offline when health checks respond unhealthy', async () => {
    stubFetch({ healthOk: false, flagsOk: false });
    window.history.pushState({}, '', '/status');
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
  });
});
