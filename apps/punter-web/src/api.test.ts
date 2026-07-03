import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkHealth,
  getBets,
  getFlags,
  getMarket,
  getMarkets,
  getOutright,
  getSimState,
  placeBet,
} from './api';
import {
  ACCOUNT,
  callsTo,
  marketFor,
  outrightMarket,
  postedBody,
  simState,
  stubFetch,
} from './__tests__/harness';

const BET = {
  id: '22222222-2222-4222-8222-222222222222',
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

const PLACE_REQUEST = {
  marketId: 'R32-9',
  selectionId: 'sel-POR',
  stake: 100,
  acceptedPrice: 1.85,
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('typed fetch layer — parse, don’t trust', () => {
  it('parses a valid SimState and returns null on a malformed one', async () => {
    stubFetch({ state: simState() });
    expect(await getSimState(fetch)).not.toBeNull();

    stubFetch({ state: { fixtures: 'nope' } });
    expect(await getSimState(fetch)).toBeNull();
  });

  it('returns null on non-2xx responses and network failures instead of crashing', async () => {
    stubFetch({ stateDown: true });
    expect(await getSimState(fetch)).toBeNull();

    stubFetch({ rejectAll: true });
    expect(await getSimState(fetch)).toBeNull();
    expect(await getMarkets(fetch)).toBeNull();
    expect(await getFlags(fetch)).toBeNull();
  });

  it('parses markets and the outright', async () => {
    stubFetch({ markets: [marketFor('R32-9')], outright: outrightMarket() });
    expect(await getMarkets(fetch)).toHaveLength(1);
    expect((await getOutright(fetch))?.id).toBe('outright');
  });

  it('resolves a marketId directly: fixture id → /markets/:id, "outright" → /outright', async () => {
    const mock = stubFetch({ markets: [marketFor('R32-9')], outright: outrightMarket() });
    expect((await getMarket(fetch, 'R32-9'))?.id).toBe('R32-9');
    expect((await getMarket(fetch, 'outright'))?.id).toBe('outright');
    expect(callsTo(mock, '/markets/R32-9')).toHaveLength(1);
    expect(callsTo(mock, '/outright')).toHaveLength(1);
  });

  it('queries bets by accountId', async () => {
    const mock = stubFetch({ bets: [BET] });
    const bets = await getBets(fetch, ACCOUNT.id);
    expect(bets).toHaveLength(1);
    expect(String(callsTo(mock, '/bets')[0][0])).toContain(`accountId=${ACCOUNT.id}`);
  });
});

describe('placeBet', () => {
  it('returns the parsed bet on success', async () => {
    const mock = stubFetch({ placeBetReplies: [{ status: 201, body: BET }] });
    const result = await placeBet(fetch, PLACE_REQUEST);
    expect(result).toEqual({ kind: 'placed', bet: BET });
    expect(postedBody(callsTo(mock, '/bets')[0])).toEqual(PLACE_REQUEST);
  });

  it('maps a 409 to price-moved', async () => {
    stubFetch({ placeBetReplies: [{ status: 409, body: { message: 'price moved' } }] });
    expect(await placeBet(fetch, PLACE_REQUEST)).toEqual({ kind: 'price-moved' });
  });

  it('surfaces server messages on other failures (string or array)', async () => {
    stubFetch({ placeBetReplies: [{ status: 400, body: { message: 'stake too high' } }] });
    expect(await placeBet(fetch, PLACE_REQUEST)).toEqual({
      kind: 'error',
      message: 'stake too high',
    });

    stubFetch({ placeBetReplies: [{ status: 400, body: { message: ['a', 'b'] } }] });
    expect(await placeBet(fetch, PLACE_REQUEST)).toEqual({ kind: 'error', message: 'a; b' });

    stubFetch({ placeBetReplies: [{ status: 500, body: {} }] });
    const fallback = await placeBet(fetch, PLACE_REQUEST);
    expect(fallback.kind).toBe('error');

    stubFetch({ placeBetReplies: [{ status: 400, body: { message: [1, 2] } }] });
    const nonString = await placeBet(fetch, PLACE_REQUEST);
    expect(nonString).toEqual({
      kind: 'error',
      message: 'The bet could not be placed. Please try again.',
    });
  });

  it('treats a malformed success body as an error, and a network failure as unreachable', async () => {
    stubFetch({ placeBetReplies: [{ status: 201, body: { nope: true } }] });
    expect((await placeBet(fetch, PLACE_REQUEST)).kind).toBe('error');

    stubFetch({ rejectAll: true });
    const result = await placeBet(fetch, PLACE_REQUEST);
    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain('unreachable');
  });
});

describe('checkHealth (the one public call)', () => {
  it('is true only when /health answers ok', async () => {
    stubFetch({});
    expect(await checkHealth('http://x.test')).toBe(true);
    stubFetch({ healthOk: false });
    expect(await checkHealth('http://x.test')).toBe(false);
    stubFetch({ rejectAll: true });
    expect(await checkHealth('http://x.test')).toBe(false);
  });
});
