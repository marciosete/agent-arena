import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { bet, renderApp, stubServices, matchMarket } from '../test/helpers';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function openSlipFromMarkets() {
  const back = await screen.findByRole('button', { name: 'Back Portugal at 1.80' });
  fireEvent.click(back);
  return screen.findByRole('dialog', { name: 'bet slip' });
}

function placedPosts(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter((entry) => entry.url.endsWith('/bets') && entry.init?.method === 'POST');
}

describe('bet slip drawer', () => {
  it('shows live stake math: potential return and the balance it leaves', async () => {
    stubServices();
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    expect(screen.getByText('🍩 180')).toBeTruthy();
    expect(screen.getByText('🍩 9,900')).toBeTruthy();
  });

  it('refuses a stake beyond the balance, client-side', async () => {
    stubServices();
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '10001' } });
    expect(screen.getByText('That’s more than your balance.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Place bet' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('submits the exact contract body — fresh UUID key, no accountId — and refreshes the balance', async () => {
    const { calls } = stubServices({ accountBalance: 9_820 });
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));

    await screen.findByText('Bet placed');
    const posts = placedPosts(calls);
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String(posts[0].init?.body));
    expect(body).toEqual({
      marketId: 'R32-9',
      selectionId: 'sel-por',
      stake: 100,
      acceptedPrice: 1.8,
      idempotencyKey: body.idempotencyKey,
    });
    expect(body.idempotencyKey).toMatch(UUID_RE);
    expect(body).not.toHaveProperty('accountId');
    // Balance refreshed from the account after placement.
    await waitFor(() => expect(screen.getByText('🍩 9,820')).toBeTruthy());
    // Done clears the slip.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'bet slip' })).toBeNull();
  });

  it('recovers from a 409: shows the moved price, accept resubmits with a new key', async () => {
    const { calls } = stubServices({
      placeBet: [{ status: 409, body: {} }, bet({ price: 1.65, potentialReturn: 165 })],
      market: matchMarket({
        selections: [
          { id: 'sel-por', name: 'Portugal', price: 1.65 },
          { id: 'sel-cro', name: 'Croatia', price: 2.35 },
        ],
      }),
    });
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));

    const alertBox = await screen.findByRole('alert');
    expect(alertBox.textContent).toContain('1.80 → 1.65');
    fireEvent.click(screen.getByRole('button', { name: 'Take 1.65' }));

    await screen.findByText('Bet placed');
    const posts = placedPosts(calls);
    expect(posts).toHaveLength(2);
    const first = JSON.parse(String(posts[0].init?.body));
    const second = JSON.parse(String(posts[1].init?.body));
    expect(first.acceptedPrice).toBe(1.8);
    expect(second.acceptedPrice).toBe(1.65);
    expect(second.idempotencyKey).toMatch(UUID_RE);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('declining a moved price drops the slip — never silently re-places', async () => {
    stubServices({ placeBet: { status: 409, body: {} } });
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(screen.queryByRole('dialog', { name: 'bet slip' })).toBeNull();
  });

  it('reports when the market closed underneath the 409', async () => {
    stubServices({
      placeBet: { status: 409, body: {} },
      market: matchMarket({ status: 'settled' }),
    });
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    expect(await screen.findByText('That market is no longer open.')).toBeTruthy();
  });

  it('surfaces the rejection message from betting', async () => {
    stubServices({ placeBet: { status: 400, body: { message: 'Insufficient funds' } } });
    renderApp({ path: '/markets' });
    await openSlipFromMarkets();
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    expect(await screen.findByText('Insufficient funds')).toBeTruthy();
  });

  it('quick chips load the stake', async () => {
    stubServices();
    renderApp({ path: '/markets' });
    const drawer = await openSlipFromMarkets();
    fireEvent.click(within(drawer).getByRole('button', { name: '500' }));
    expect((screen.getByLabelText('Stake') as HTMLInputElement).value).toBe('500');
  });

  it('the header toggle opens an empty slip with a hint', async () => {
    stubServices();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Bet Slip' }));
    expect(await screen.findByText('Tap a price anywhere to load your slip.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog', { name: 'bet slip' })).toBeNull();
  });
});
