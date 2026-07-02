import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaClient } from '../client';
import { account, ACCOUNT_ID, bet } from './fixtures';

const URLS = {
  pricing: 'http://price.test',
  betting: 'http://bet.test',
  simulator: 'http://sim.test',
};

interface Captured {
  url: string;
  init?: RequestInit;
}

function stubFetch(payload: unknown): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json(payload);
    })
  );
  return calls;
}

function headers(call: Captured): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArenaClient', () => {
  it('provisions a bot with the admin key and an isBot body — no bearer yet', async () => {
    const calls = stubFetch({ token: 'tok', account: account() });
    const result = await new ArenaClient(URLS, 'secret-admin').provisionBot('Sharp');
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('http://bet.test/accounts');
    expect(calls[0].init?.method).toBe('POST');
    expect(headers(calls[0])['x-admin-key']).toBe('secret-admin');
    expect(headers(calls[0]).authorization).toBeUndefined();
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Sharp', isBot: true });
  });

  it('reads markets from pricing with a bearer token', async () => {
    const calls = stubFetch([]);
    const result = await new ArenaClient(URLS, '').getMarkets('tok');
    expect(result).toEqual({ ok: true, data: [] });
    expect(calls[0].url).toBe('http://price.test/markets');
    expect(headers(calls[0]).authorization).toBe('Bearer tok');
  });

  it('places bets against betting with a bearer token', async () => {
    const calls = stubFetch(bet());
    const request = {
      marketId: 'm1',
      selectionId: 'm1-home',
      stake: 100,
      acceptedPrice: 2,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    };
    const result = await new ArenaClient(URLS, '').placeBet('tok', request);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('http://bet.test/bets');
    expect(headers(calls[0]).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(request);
  });

  it('reads its own account and bets by id', async () => {
    const accountCalls = stubFetch(account());
    await new ArenaClient(URLS, '').getAccount('tok', ACCOUNT_ID);
    expect(accountCalls[0].url).toBe(`http://bet.test/accounts/${ACCOUNT_ID}`);

    const betCalls = stubFetch([bet()]);
    const bets = await new ArenaClient(URLS, '').getBets('tok', ACCOUNT_ID);
    expect(bets.ok).toBe(true);
    expect(betCalls[0].url).toBe(`http://bet.test/bets?accountId=${ACCOUNT_ID}`);
    expect(headers(betCalls[0]).authorization).toBe('Bearer tok');
  });

  it('polls the simulator state with a bearer token', async () => {
    const calls = stubFetch({
      fixtures: [],
      champion: null,
      playedFixtureIds: [],
      remainingFixtureIds: [],
    });
    const result = await new ArenaClient(URLS, '').getSimState('tok');
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('http://sim.test/state');
    expect(headers(calls[0]).authorization).toBe('Bearer tok');
  });
});
