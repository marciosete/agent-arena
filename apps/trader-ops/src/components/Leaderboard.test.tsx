import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { Account } from '@arena/contracts';
import { jsonResponse, renderWithAuth } from '../test/helpers';
import { Leaderboard } from './Leaderboard';

/** Build an `AccountSchema`-valid account for the stubbed `/accounts` payload. */
function account(overrides: Partial<Account> & { id: string; name: string }): Account {
  return {
    email: 'punter@example.com',
    balance: 10_000,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Punter cell (column 2) of every rendered data row, top to bottom. */
function punterCells(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1].textContent ?? '');
}

describe('Leaderboard', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the leaderboard in balance order with nicknames, bot tags and signed P&L from GET /accounts with the Bearer JWT', async () => {
    const accounts = [
      account({ id: '11111111-1111-4111-8111-111111111111', name: 'Bravo', balance: 12_000 }),
      account({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'RoboBot',
        balance: 15_000,
        isBot: true,
      }),
      account({ id: '33333333-3333-4333-8333-333333333333', name: 'Alpha', balance: 8_000 }),
      account({ id: '44444444-4444-4444-8444-444444444444', name: 'Flat', balance: 10_000 }),
    ];
    let seenUrl = '';
    let seenAuth: string | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenAuth = new Headers(init?.headers).get('Authorization');
      return jsonResponse(accounts);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAuth(<Leaderboard />);

    // Wait for the first poll to land the rows.
    expect(await screen.findByText('RoboBot')).toBeTruthy();

    // The read hit /accounts and carried the session's Bearer token.
    expect(seenUrl).toContain('/accounts');
    expect(seenAuth).toMatch(/^Bearer .+/);

    // Ordered by balance desc: RoboBot (15k) → Bravo (12k) → Flat (10k) → Alpha (8k).
    const cells = punterCells();
    expect(cells[0]).toContain('RoboBot');
    expect(cells[1]).toContain('Bravo');
    expect(cells[2]).toContain('Flat');
    expect(cells[3]).toContain('Alpha');

    // Only the bot row wears the bot tag.
    expect(cells[0]).toContain('bot');
    expect(cells[1]).not.toContain('bot');

    // Signed P&L against the 10k opening balance: profit, break-even, loss.
    expect(screen.getByText('+5,000')).toBeTruthy();
    expect(screen.getByText('+2,000')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('-2,000')).toBeTruthy();

    // Both punters in profit are flagged "hot"; the losing one is not.
    expect(screen.getAllByText('hot')).toHaveLength(2);

    // The panel note anchors P&L to the opening balance.
    expect(screen.getByText(/opening balance 10,000/)).toBeTruthy();
  });

  it('shows the empty state and OFFLINE status when the betting service is unreachable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAuth(<Leaderboard />);

    expect(await screen.findByText('OFFLINE')).toBeTruthy();
    expect(screen.getByText('no punters on the book yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
