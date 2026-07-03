import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { Bet } from '@arena/contracts';
import {
  ACCOUNT,
  arenaAfterEach,
  callsTo,
  marketFor,
  renderWithProviders,
  seedSession,
  stubFetch,
} from '../__tests__/harness';
import { BetList, MyBetsPage } from './MyBetsPage';

afterEach(arenaAfterEach);

function bet(overrides: Partial<Bet>): Bet {
  return {
    id: '55555555-5555-4555-8555-555555555551',
    accountId: ACCOUNT.id,
    marketId: 'R32-9',
    selectionId: 'sel-POR',
    stake: 100,
    price: 1.85,
    potentialReturn: 185,
    status: 'pending',
    placedAt: '2026-07-03T10:00:00.000Z',
    settledAt: null,
    ...overrides,
  };
}

describe('bet list', () => {
  it('shows pending / won / lost with stake, price and the right return, newest first', () => {
    const bets = [
      bet({ id: '55555555-5555-4555-8555-555555555551', placedAt: '2026-07-03T09:00:00.000Z' }),
      bet({
        id: '55555555-5555-4555-8555-555555555552',
        selectionId: 'sel-CRO',
        status: 'won',
        price: 2.1,
        potentialReturn: 210,
        placedAt: '2026-07-03T11:00:00.000Z',
        settledAt: '2026-07-03T12:00:00.000Z',
      }),
      bet({
        id: '55555555-5555-4555-8555-555555555553',
        status: 'lost',
        placedAt: '2026-07-03T10:00:00.000Z',
        settledAt: '2026-07-03T12:00:00.000Z',
      }),
    ];
    render(<BetList bets={bets} markets={[marketFor('R32-9')]} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Sorted by placedAt descending: won (11:00), lost (10:00), pending (09:00).
    expect(within(rows[0]).getByText('won')).toBeTruthy();
    expect(within(rows[0]).getByText('Croatia')).toBeTruthy();
    expect(within(rows[0]).getByText(/returned 🍩 210/)).toBeTruthy();
    expect(within(rows[1]).getByText('lost')).toBeTruthy();
    expect(within(rows[1]).getByText(/returned 🍩 0/)).toBeTruthy();
    expect(within(rows[2]).getByText('pending')).toBeTruthy();
    expect(within(rows[2]).getByText(/returns 🍩 185/)).toBeTruthy();
    expect(within(rows[2]).getByText(/🍩 100 @ 1.85/)).toBeTruthy();
  });

  it('falls back to raw ids while pricing is unreachable', () => {
    render(<BetList bets={[bet({})]} markets={null} />);
    expect(screen.getByText('sel-POR')).toBeTruthy();
    expect(screen.getByText('R32-9')).toBeTruthy();
  });

  it('shows an inviting empty state', () => {
    render(<BetList bets={[]} markets={null} />);
    expect(screen.getByText(/No bets yet/)).toBeTruthy();
  });

  it('does not claim "no bets" while the list has not loaded (null ≠ empty)', () => {
    render(<BetList bets={null} markets={null} />);
    expect(screen.getByText(/Fetching your bets/)).toBeTruthy();
    expect(screen.queryByText(/No bets yet/)).toBeNull();
  });

  it('shows a void bet as a stake refund, past tense', () => {
    render(
      <BetList
        bets={[bet({ status: 'void', settledAt: '2026-07-03T12:00:00.000Z' })]}
        markets={[marketFor('R32-9')]}
      />
    );
    expect(screen.getByText('void')).toBeTruthy();
    expect(screen.getByText(/returned 🍩 100/)).toBeTruthy();
  });
});

describe('my bets page (polls betting by accountId)', () => {
  it('loads the punter’s own bets and labels them from the market join', async () => {
    seedSession();
    const mock = stubFetch({ bets: [bet({})], markets: [marketFor('R32-9')] });
    renderWithProviders(<MyBetsPage />);
    expect(await screen.findByText('Portugal')).toBeTruthy();
    await waitFor(() =>
      expect(
        callsTo(mock, '/bets').some(([input]) => String(input).includes(`accountId=${ACCOUNT.id}`))
      ).toBe(true)
    );
  });
});
