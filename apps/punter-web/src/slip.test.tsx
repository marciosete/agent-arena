import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ACCOUNT,
  arenaAfterEach,
  callsTo,
  marketFor,
  postedBody,
  renderWithProviders,
  seedSession,
  stubFetch,
  type StubOptions,
} from './__tests__/harness';
import { useSlip } from './slip';

afterEach(arenaAfterEach);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACED_BET = {
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
};

/** A price button, as any page would render one. */
function Opener() {
  const { openWith } = useSlip();
  return (
    <button
      type="button"
      onClick={() =>
        openWith({
          marketId: 'R32-9',
          selectionId: 'sel-POR',
          selectionName: 'Portugal',
          marketName: 'Portugal v Croatia',
          price: 1.85,
        })
      }
    >
      pick Portugal
    </button>
  );
}

async function openSlipWithStake(stake: string, stub: StubOptions) {
  seedSession();
  const mock = stubFetch(stub);
  renderWithProviders(<Opener />);
  fireEvent.click(await screen.findByText('pick Portugal'));
  fireEvent.change(await screen.findByLabelText('Stake'), { target: { value: stake } });
  return mock;
}

describe('bet slip math + validation', () => {
  it('shows potential return (stake × price) and the balance the bet would leave', async () => {
    await openSlipWithStake('100', {});
    expect(screen.getByText('🍩 185')).toBeTruthy(); // 100 × 1.85
    expect(screen.getByText('🍩 9,900')).toBeTruthy(); // 10,000 − 100
  });

  it('refuses a stake above the balance client-side', async () => {
    await openSlipWithStake('10001', {});
    expect(screen.getByRole('alert').textContent).toContain('that stake is too high');
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
  });

  it('disables placement for a zero, negative or empty stake', async () => {
    await openSlipWithStake('0', {});
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '-5' } });
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
  });
});

describe('bet submission (DoD): the exact PlaceBetRequest, no accountId', () => {
  it('submits { marketId, selectionId, stake, acceptedPrice, idempotencyKey } with a fresh UUID key', async () => {
    const mock = await openSlipWithStake('100', {
      placeBetReplies: [{ status: 201, body: PLACED_BET }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());

    const posts = callsTo(mock, '/bets').filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = postedBody(posts[0]);
    expect(Object.keys(body).sort()).toEqual([
      'acceptedPrice',
      'idempotencyKey',
      'marketId',
      'selectionId',
      'stake',
    ]);
    expect(body).not.toHaveProperty('accountId');
    expect(body.marketId).toBe('R32-9');
    expect(body.selectionId).toBe('sel-POR');
    expect(body.stake).toBe(100);
    expect(body.acceptedPrice).toBe(1.85);
    expect(String(body.idempotencyKey)).toMatch(UUID_RE);
    // Success confirms and refreshes the account balance.
    expect(callsTo(mock, `/accounts/${ACCOUNT.id}`).length).toBeGreaterThan(0);
  });

  it('surfaces a server rejection and lets the punter retry', async () => {
    await openSlipWithStake('100', {
      placeBetReplies: [{ status: 400, body: { message: 'insufficient funds' } }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('insufficient funds')
    );
    // Editing the stake acknowledges the error and clears it.
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '50' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Place bet' })).toBeTruthy();
  });
});

describe('409 price-moved recovery (DoD): never silently re-place', () => {
  it('shows the moved price, and accepting resubmits at it with a FRESH idempotency key', async () => {
    const mock = await openSlipWithStake('100', {
      markets: [marketFor('R32-9', {}, [2.05, 1.9])], // the refetched live market
      placeBetReplies: [
        { status: 409, body: { message: 'price moved' } },
        { status: 201, body: { ...PLACED_BET, price: 2.05, potentialReturn: 205 } },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));

    // The new price is offered, not auto-taken.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('it is now 2.05'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept 2.05' }));
    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());

    const posts = callsTo(mock, '/bets').filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(2);
    const first = postedBody(posts[0]);
    const second = postedBody(posts[1]);
    expect(first.acceptedPrice).toBe(1.85);
    expect(second.acceptedPrice).toBe(2.05);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(String(second.idempotencyKey)).toMatch(UUID_RE);
  });

  it('cancelling after a 409 drops the selection', async () => {
    await openSlipWithStake('100', {
      markets: [marketFor('R32-9', {}, [2.05, 1.9])],
      placeBetReplies: [{ status: 409 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/Nothing on the slip yet/)).toBeTruthy();
  });

  it('handles the market being unreadable after a 409', async () => {
    await openSlipWithStake('100', {
      markets: [], // refetch will 404
      placeBetReplies: [{ status: 409 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('can’t be re-offered')
    );
  });

  it('does not re-offer a price from a market that suspended since (isBettable guard)', async () => {
    await openSlipWithStake('100', {
      markets: [marketFor('R32-9', { status: 'suspended' }, [2.05, 1.9])],
      placeBetReplies: [{ status: 409 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('can’t be re-offered')
    );
    expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull();
  });

  it('disables Accept while the edited stake is invalid (no unvalidated resubmits)', async () => {
    await openSlipWithStake('100', {
      markets: [marketFor('R32-9', {}, [2.05, 1.9])],
      placeBetReplies: [{ status: 409 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    const accept = await screen.findByRole('button', { name: 'Accept 2.05' });
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '' } });
    expect(accept).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '50' } });
    expect(accept).toHaveProperty('disabled', false);
  });
});

describe('idempotency & resilience (review fixes)', () => {
  it('reuses the SAME idempotency key when retrying after an error — a lost response cannot double-charge', async () => {
    const mock = await openSlipWithStake('100', {
      placeBetReplies: [
        { status: 500, body: { message: 'flaky' } },
        { status: 201, body: PLACED_BET },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('flaky'));
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());

    const posts = callsTo(mock, '/bets').filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(postedBody(posts[1]).idempotencyKey).toBe(postedBody(posts[0]).idempotencyKey);
  });

  it('still confirms the bet when the post-placement balance refresh fails (bet IS committed)', async () => {
    seedSession();
    const mock = stubFetch({ placeBetReplies: [{ status: 201, body: PLACED_BET }] });
    mock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/accounts/')) {
        throw new Error('betting flaked mid-refresh');
      }
      if (url.includes('/bets') && init?.method === 'POST') {
        return new Response(JSON.stringify(PLACED_BET), { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    renderWithProviders(<Opener />);
    fireEvent.click(await screen.findByText('pick Portugal'));
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());
  });
});

describe('stake input hardening (review fixes)', () => {
  it('rejects malformed stakes instead of silently truncating them', async () => {
    await openSlipWithStake('10,50', {});
    expect(screen.getByRole('alert').textContent).toContain('Enter a stake like 25 or 12.50');
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '5x' } });
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '12.505' } });
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '12.50' } });
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', false);
  });

  it('caps the stake at OPENING_BALANCE even for punters whose balance outgrew it', async () => {
    seedSession({ ...ACCOUNT, balance: 15_000 });
    stubFetch({});
    renderWithProviders(<Opener />);
    fireEvent.click(await screen.findByText('pick Portugal'));
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '12000' } });
    expect(screen.getByRole('alert').textContent).toContain('maximum stake is 🍩 10,000');
    expect(screen.getByRole('button', { name: 'Place bet' })).toHaveProperty('disabled', true);
  });
});

describe('slip context', () => {
  it('useSlip refuses to run outside its provider', () => {
    const orphan = () => render(<Opener />);
    expect(orphan).toThrowError(/within a <SlipProvider>/);
  });
});

describe('drawer chrome', () => {
  it('opens empty from the nav, closes via backdrop, and clears after a placed bet', async () => {
    seedSession();
    stubFetch({ placeBetReplies: [{ status: 201, body: PLACED_BET }] });
    renderWithProviders(<Opener />);

    fireEvent.click(await screen.findByText('pick Portugal'));
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => expect(screen.getByText(/Bet placed/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText(/Nothing on the slip yet/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close bet slip'));
    expect(screen.queryByLabelText('Bet slip')).toBeNull();
  });
});
