import { verifyTokenClaims } from '@arena/service-auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArenaClient, type ClientConfig, type FetchLike } from '../http';
import {
  accountFixture,
  authResponseFixture,
  betFixture,
  jsonResponse,
  marketFixture,
} from './fixtures';

// The client mints its admin service token off SESSION_SECRET; verifyTokenClaims
// below reads the same value, so both must see it before any token is signed.
beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret';
});

const config: ClientConfig = {
  pricingUrl: 'http://pricing.test',
  bettingUrl: 'http://betting.test',
};

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function recordingClient(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>
) {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  };
  return { calls, client: new ArenaClient(config, fetchImpl) };
}

function headersOf(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('ArenaClient success paths', () => {
  it('provisions a bot with POST /accounts, a Bearer admin service token (no x-admin-key) and { name, isBot: true }', async () => {
    const { calls, client } = recordingClient(() => jsonResponse(authResponseFixture()));
    const result = await client.provisionBot('Steady');

    expect(result).toEqual({ ok: true, data: authResponseFixture() });
    expect(calls[0].url).toBe('http://betting.test/accounts');
    expect(calls[0].init?.method).toBe('POST');

    // Provisioning is gated by IDENTITY, not a shared key: no x-admin-key header,
    // and the Authorization Bearer carries a signed service token whose verified
    // claims are sub 'bots' with admin: true — that claim is what unlocks POST /accounts.
    const headers = headersOf(calls[0]);
    expect(headers).not.toHaveProperty('x-admin-key');
    expect(headers.authorization).toMatch(/^Bearer /);
    const claims = verifyTokenClaims(headers.authorization.slice('Bearer '.length));
    expect(claims).toEqual({ sub: 'bots', admin: true });

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Steady', isBot: true });
  });

  it('fetches markets with the Bearer token and parses them against MarketSchema', async () => {
    const { calls, client } = recordingClient(() => jsonResponse([marketFixture()]));
    const result = await client.getMarkets('token-123');

    expect(result.ok).toBe(true);
    expect(result.ok && result.data[0].selections).toHaveLength(2);
    expect(calls[0].url).toBe('http://pricing.test/markets');
    expect(headersOf(calls[0]).authorization).toBe('Bearer token-123');
  });

  it('attaches a timeout signal so a black-holed request cannot stall the roster', async () => {
    const { calls, client } = recordingClient(() => jsonResponse([marketFixture()]));
    await client.getMarkets('token-123');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fetches an account by id, URL-encoding the id', async () => {
    const { calls, client } = recordingClient(() => jsonResponse(accountFixture()));
    const result = await client.getAccount('token-123', 'abc/123');

    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('http://betting.test/accounts/abc%2F123');
  });

  it('fetches a bot own bets via GET /bets?accountId=', async () => {
    const { calls, client } = recordingClient(() => jsonResponse([betFixture()]));
    const result = await client.getBets('token-123', 'acc-1');

    expect(result.ok && result.data).toHaveLength(1);
    expect(calls[0].url).toBe('http://betting.test/bets?accountId=acc-1');
    expect(headersOf(calls[0]).authorization).toBe('Bearer token-123');
  });

  it('places a bet with POST /bets and parses the accepted Bet', async () => {
    const { calls, client } = recordingClient(() => jsonResponse(betFixture()));
    const result = await client.placeBet('token-123', {
      marketId: 'fixture-qf-1',
      selectionId: 'sel-france',
      stake: 100,
      acceptedPrice: 2,
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
    });

    expect(result.ok && result.data.status).toBe('pending');
    expect(calls[0].init?.method).toBe('POST');
    expect(headersOf(calls[0]).authorization).toBe('Bearer token-123');
  });
});

describe('ArenaClient degrades gracefully instead of crashing', () => {
  it('turns connection-refused into a network failure value, not a throw', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:4001'));
    const client = new ArenaClient(config, fetchImpl);

    const result = await client.getMarkets('token-123');
    expect(result).toEqual({
      ok: false,
      kind: 'network',
      detail: expect.stringContaining('ECONNREFUSED'),
    });
  });

  it('turns a non-Error rejection into a network failure too', async () => {
    const client = new ArenaClient(config, () => Promise.reject('socket hang up'));
    const result = await client.getMarkets('token-123');
    expect(result).toEqual({
      ok: false,
      kind: 'network',
      detail: expect.stringContaining('socket hang up'),
    });
  });

  it.each([401, 403, 500, 503])('turns HTTP %i into an http failure value', async (status) => {
    const { client } = recordingClient(() => jsonResponse({ message: 'nope' }, status));
    const result = await client.getMarkets('token-123');
    expect(result).toEqual({
      ok: false,
      kind: 'http',
      status,
      detail: expect.stringContaining(`HTTP ${status}`),
    });
  });

  it('flags a 409 on bet placement as price-moved — a normal skip', async () => {
    const { client } = recordingClient(() => jsonResponse({ message: 'price moved' }, 409));
    const result = await client.placeBet('token-123', {
      marketId: 'fixture-qf-1',
      selectionId: 'sel-france',
      stake: 100,
      acceptedPrice: 2,
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
    });
    expect(result).toMatchObject({ ok: false, kind: 'price-moved', status: 409 });
  });

  it('treats a non-JSON body as a contract failure', async () => {
    const { client } = recordingClient(() => new Response('<html>oops</html>', { status: 200 }));
    const result = await client.getMarkets('token-123');
    expect(result).toMatchObject({ ok: false, kind: 'contract' });
    expect(result.ok === false && result.detail).toContain('non-JSON');
  });

  it('treats a schema-violating body as a contract failure', async () => {
    const { client } = recordingClient(() => jsonResponse([{ id: 42, bogus: true }]));
    const result = await client.getMarkets('token-123');
    expect(result).toMatchObject({ ok: false, kind: 'contract' });
    expect(result.ok === false && result.detail).toContain('contracts schema');
  });
});
