import { describe, expect, it, vi } from 'vitest';
import type { Bet, Market, SimState } from '@arena/contracts';
import { FIXTURES } from '@arena/contracts';
import {
  fetchBets,
  fetchFlags,
  fetchMarket,
  fetchMarkets,
  fetchOutright,
  fetchSimState,
  placeBet,
} from './api';

const MARKET: Market = {
  id: 'R32-9',
  type: 'MATCH_WINNER',
  fixtureId: 'R32-9',
  name: 'Portugal v Croatia',
  status: 'open',
  selections: [
    { id: 'sel-por', name: 'Portugal', price: 1.8 },
    { id: 'sel-cro', name: 'Croatia', price: 2.1 },
  ],
};

const OUTRIGHT: Market = {
  id: 'outright',
  type: 'OUTRIGHT',
  fixtureId: null,
  name: 'Tournament winner',
  status: 'open',
  selections: [
    { id: 'out-esp', name: 'Spain', price: 5.5 },
    { id: 'out-fra', name: 'France', price: 6.0 },
  ],
};

const SIM_STATE: SimState = {
  fixtures: FIXTURES,
  champion: null,
  playedFixtureIds: [],
  remainingFixtureIds: FIXTURES.map((fixture) => fixture.id),
};

const BET: Bet = {
  id: '22222222-2222-4222-8222-222222222222',
  accountId: '11111111-1111-4111-8111-111111111111',
  marketId: 'R32-9',
  selectionId: 'sel-por',
  stake: 100,
  price: 1.8,
  potentialReturn: 180,
  status: 'pending',
  placedAt: '2026-07-03T10:00:00.000Z',
  settledAt: null,
};

const PLACE_REQUEST = {
  marketId: 'R32-9',
  selectionId: 'sel-por',
  stake: 100,
  acceptedPrice: 1.8,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
};

function okFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
}

describe('typed fetch layer', () => {
  it('parses flags and hits the flags service', async () => {
    const flags = [
      { key: 'punter-markets', enabled: true, description: '', updatedAt: '2026-07-03T09:00:00Z' },
    ];
    const apiFetch = okFetch(flags);
    expect(await fetchFlags(apiFetch)).toEqual(flags);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4004/flags');
  });

  it('parses sim state from the simulator', async () => {
    const apiFetch = okFetch(SIM_STATE);
    expect(await fetchSimState(apiFetch)).toEqual(SIM_STATE);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4003/state');
  });

  it('parses the markets list from pricing', async () => {
    const apiFetch = okFetch([MARKET]);
    expect(await fetchMarkets(apiFetch)).toEqual([MARKET]);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4001/markets');
  });

  it('parses the outright market', async () => {
    const apiFetch = okFetch(OUTRIGHT);
    expect(await fetchOutright(apiFetch)).toEqual(OUTRIGHT);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4001/outright');
  });

  it('resolves a match market directly by its derivable id', async () => {
    const apiFetch = okFetch(MARKET);
    expect(await fetchMarket(apiFetch, 'R32-9')).toEqual(MARKET);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4001/markets/R32-9');
  });

  it("routes the 'outright' market id to the outright endpoint", async () => {
    const apiFetch = okFetch(OUTRIGHT);
    expect(await fetchMarket(apiFetch, 'outright')).toEqual(OUTRIGHT);
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4001/outright');
  });

  it('fetches bets scoped to the account', async () => {
    const apiFetch = okFetch([BET]);
    expect(await fetchBets(apiFetch, BET.accountId)).toEqual([BET]);
    expect(apiFetch).toHaveBeenCalledWith(`http://localhost:4002/bets?accountId=${BET.accountId}`);
  });

  it('returns null on a non-2xx response', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await fetchMarkets(apiFetch)).toBeNull();
  });

  it('returns null when the payload fails the contract schema', async () => {
    expect(await fetchMarkets(okFetch([{ nope: true }]))).toBeNull();
  });

  it('returns null when the service is unreachable', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('down'));
    expect(await fetchSimState(apiFetch)).toBeNull();
  });
});

describe('placeBet', () => {
  it('POSTs the contract body and returns the placed bet', async () => {
    const apiFetch = okFetch(BET);
    const result = await placeBet(apiFetch, PLACE_REQUEST);
    expect(result).toEqual({ kind: 'placed', bet: BET });
    expect(apiFetch).toHaveBeenCalledWith('http://localhost:4002/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PLACE_REQUEST),
    });
    const sent = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1].body as string);
    expect(sent).not.toHaveProperty('accountId');
  });

  it('maps a 409 to price-moved', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    expect(await placeBet(apiFetch, PLACE_REQUEST)).toEqual({ kind: 'price-moved' });
  });

  it('surfaces a string rejection message', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Insufficient funds' }),
    });
    expect(await placeBet(apiFetch, PLACE_REQUEST)).toEqual({
      kind: 'rejected',
      message: 'Insufficient funds',
    });
  });

  it('joins an array rejection message (Nest validation shape)', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: ['stake must be positive', 'bad key'] }),
    });
    expect(await placeBet(apiFetch, PLACE_REQUEST)).toEqual({
      kind: 'rejected',
      message: 'stake must be positive bad key',
    });
  });

  it('falls back to a status message when the error body is unreadable', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('no body');
      },
    });
    expect(await placeBet(apiFetch, PLACE_REQUEST)).toEqual({
      kind: 'rejected',
      message: 'The bet was rejected (500).',
    });
  });

  it('returns unavailable when betting is unreachable', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('down'));
    expect(await placeBet(apiFetch, PLACE_REQUEST)).toEqual({ kind: 'unavailable' });
  });

  it('treats a 2xx body that fails the Bet schema as unavailable', async () => {
    expect(await placeBet(okFetch({ nope: true }), PLACE_REQUEST)).toEqual({
      kind: 'unavailable',
    });
  });
});
