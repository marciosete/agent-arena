import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import type { Market } from '@arena/contracts';
import { jsonResponse, renderWithAuth } from '../test/helpers';
import { MarketMonitor } from './MarketMonitor';

type Sel = { id: string; name: string; price: number; probability?: number };

function market(id: string, name: string, status: Market['status'], selections: Sel[]): Market {
  return { id, type: 'MATCH_WINNER', fixtureId: id, name, status, selections };
}

const SEMI_ONE = market('F-SF-1', 'Semi-final · Alpha v Beta', 'open', [
  { id: 'sel-a', name: 'Alpha', price: 1.9, probability: 0.5 },
  { id: 'sel-b', name: 'Beta', price: 2.2 },
]);

const SEMI_TWO = market('F-SF-2', 'Semi-final · Gamma v Delta', 'suspended', [
  { id: 'sel-c', name: 'Gamma', price: 1.5, probability: 0.66 },
  { id: 'sel-d', name: 'Delta', price: 2.0 },
]);

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('MarketMonitor', () => {
  it('renders prices with fair probability and margin from GET /markets with the Bearer JWT', async () => {
    const authHeaders: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        authHeaders.push(new Headers(init?.headers).get('Authorization'));
        return jsonResponse([SEMI_ONE, SEMI_TWO]);
      })
    );

    renderWithAuth(<MarketMonitor />);

    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
    // Status chips per market.
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('suspended')).toBeTruthy();
    // Price at two decimals; fair probability as a percentage; blank when absent.
    expect(screen.getByText('1.90')).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2); // Beta + Delta carry no probability

    // Margin health line: overround to three places and signed drift vs target.
    const margins = screen.getAllByText(/vs target/);
    expect(margins.some((m) => (m.textContent ?? '').includes('0.981'))).toBe(true); // 1/1.9+1/2.2
    expect(margins.some((m) => (m.textContent ?? '').includes('+11.1%'))).toBe(true); // 1/1.5+1/2.0

    expect(authHeaders.some((header) => header?.startsWith('Bearer '))).toBe(true);
  });

  it('flashes a price that moved between polls', async () => {
    vi.useFakeTimers();
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        const second = call > 1;
        // Alpha drifts out (1.90 → 2.60) while Beta shortens (2.20 → 1.80).
        return jsonResponse([
          market('F-SF-1', 'Semi-final · Alpha v Beta', 'open', [
            { id: 'sel-a', name: 'Alpha', price: second ? 2.6 : 1.9, probability: 0.5 },
            { id: 'sel-b', name: 'Beta', price: second ? 1.8 : 2.2 },
          ]),
        ]);
      })
    );

    renderWithAuth(<MarketMonitor />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('1.90')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const up = screen.getByText(/2\.60/);
    expect(up.className).toContain('px-up');
    expect(up.textContent).toContain('▲');

    const down = screen.getByText(/1\.80/);
    expect(down.className).toContain('px-down');
    expect(down.textContent).toContain('▼');
  });

  it('shows an empty state when no markets are priced yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([]))
    );

    renderWithAuth(<MarketMonitor />);

    expect(await screen.findByText('no markets priced yet')).toBeTruthy();
  });
});
