import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { bet, renderApp, stubServices } from '../test/helpers';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

describe('my bets', () => {
  it('renders pending, won and lost bets with stake, price and returns', async () => {
    stubServices({
      bets: [
        bet(),
        bet({
          id: '33333333-3333-4333-8333-333333333333',
          selectionId: 'sel-cro',
          status: 'won',
          stake: 50,
          price: 2.1,
          potentialReturn: 105,
          placedAt: '2026-07-03T11:00:00.000Z',
          settledAt: '2026-07-03T12:00:00.000Z',
        }),
        bet({
          id: '44444444-4444-4444-8444-444444444444',
          status: 'lost',
          placedAt: '2026-07-03T09:00:00.000Z',
          settledAt: '2026-07-03T12:00:00.000Z',
        }),
      ],
    });
    renderApp({ path: '/my-bets' });
    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
    expect(screen.getByText('Won')).toBeTruthy();
    expect(screen.getByText('Lost')).toBeTruthy();
    // Names resolved through the market's selections, newest bet first.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Croatia');
    expect(rows[0].textContent).toContain('Returned 🍩 105');
    expect(rows[1].textContent).toContain('To return 🍩 180');
    expect(rows[2].textContent).toContain('No return');
    expect(screen.getAllByText('Portugal v Croatia').length).toBeGreaterThan(0);
  });

  it('falls back to raw ids when a bet references a market it cannot resolve', async () => {
    stubServices({
      bets: [
        bet({
          id: '55555555-5555-4555-8555-555555555555',
          marketId: 'GHOST-1',
          selectionId: 'ghost-sel',
          status: 'void',
        }),
      ],
      markets: [],
      outright: { status: 500, body: {} },
    });
    renderApp({ path: '/my-bets' });
    await waitFor(() => expect(screen.getByText('Void')).toBeTruthy());
    expect(screen.getByText('ghost-sel')).toBeTruthy();
    expect(screen.getByText('GHOST-1')).toBeTruthy();
    expect(screen.getByText('To return 🍩 180')).toBeTruthy();
  });

  it('shows the empty state for a fresh account', async () => {
    stubServices({ bets: [] });
    renderApp({ path: '/my-bets' });
    await waitFor(() =>
      expect(
        screen.getByText('Nothing riding yet — open the markets and pick a winner.')
      ).toBeTruthy()
    );
  });

  it('waits gracefully while betting is unreachable', async () => {
    stubServices({ bets: { status: 500, body: {} } });
    renderApp({ path: '/my-bets' });
    await waitFor(() => expect(screen.getByText('Fetching your bets…')).toBeTruthy());
  });
});
