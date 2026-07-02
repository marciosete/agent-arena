import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { matchMarket, renderApp, stubServices } from '../test/helpers';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

describe('markets board', () => {
  it('groups priced fixtures by round with team flags on the price buttons', async () => {
    stubServices({
      markets: [
        matchMarket(),
        matchMarket({
          id: 'R16-1',
          fixtureId: 'R16-1',
          name: 'Canada v Morocco',
          selections: [
            { id: 'sel-can', name: 'Canada', price: 2.4 },
            { id: 'sel-mar', name: 'Morocco', price: 1.6 },
          ],
        }),
      ],
    });
    renderApp({ path: '/markets' });
    await waitFor(() => expect(screen.getByText('Round of 32')).toBeTruthy());
    expect(screen.getByText('Round of 16')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back Portugal at 1.80' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back Morocco at 1.60' })).toBeTruthy();
    expect(screen.getByText('🇵🇹')).toBeTruthy();
  });

  it('renders suspended and settled markets clearly non-clickable', async () => {
    stubServices({
      markets: [
        matchMarket({ status: 'suspended' }),
        matchMarket({
          id: 'R32-10',
          fixtureId: 'R32-10',
          name: 'Spain v Austria',
          status: 'settled',
          selections: [
            { id: 'sel-esp', name: 'Spain', price: 1.55 },
            { id: 'sel-aut', name: 'Austria', price: 2.6 },
          ],
        }),
      ],
    });
    renderApp({ path: '/markets' });
    await waitFor(() => expect(screen.getByText('suspended')).toBeTruthy());
    expect(screen.getByText('settled')).toBeTruthy();
    for (const name of ['Back Portugal at 1.80', 'Back Spain at 1.55']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows an empty state when nothing is priced yet', async () => {
    stubServices({ markets: [] });
    renderApp({ path: '/markets' });
    await waitFor(() =>
      expect(screen.getByText('No open markets yet — check back soon.')).toBeTruthy()
    );
  });

  it('waits gracefully while pricing is unreachable', async () => {
    stubServices({ markets: { status: 500, body: {} } });
    renderApp({ path: '/markets' });
    await waitFor(() => expect(screen.getByText('Waiting for the market board…')).toBeTruthy());
  });
});
