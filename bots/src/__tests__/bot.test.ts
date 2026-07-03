import type { Bet, Market } from '@arena/contracts';
import { verifyTokenClaims } from '@arena/service-auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultUuid, provisionBot, runRound, type BotDeps, type Personality } from '../bot';
import { ArenaClient, type BotClient, type FetchLike } from '../http';
import { steadyStrategy, type Strategy } from '../strategies';
import {
  FIXED_UUID,
  accountFixture,
  authResponseFixture,
  betFixture,
  jsonResponse,
  marketFixture,
} from './fixtures';

// The real ArenaClient mints its admin service token off SESSION_SECRET; set it
// (and let verifyTokenClaims read the same value) before any token is signed.
beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret';
});

function personality(overrides: Partial<Personality> = {}): Personality {
  return {
    name: 'Steady',
    emoji: '🛡️',
    tagline: 'favourites, five percent, forever',
    strategy: steadyStrategy,
    ...overrides,
  };
}

function makeDeps(client: BotClient): BotDeps & { logs: string[] } {
  const logs: string[] = [];
  return { client, log: (line) => logs.push(line), rng: () => 0, uuid: () => FIXED_UUID, logs };
}

function stubClient(overrides: Partial<BotClient> = {}): BotClient {
  return {
    provisionBot: async () => ({ ok: true, data: authResponseFixture() }),
    getMarkets: async () => ({ ok: true, data: [marketFixture()] }),
    getAccount: async () => ({ ok: true, data: accountFixture() }),
    getBets: async () => ({ ok: true, data: [] }),
    placeBet: async () => ({ ok: true, data: betFixture() }),
    ...overrides,
  };
}

describe('bot provisioning and betting flow (mocked fetch)', () => {
  it('provisions itself with an admin service token and places an accepted bet — account Bearer token reused, idempotencyKey sent, no accountId', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl: FetchLike = (url, init) => {
      calls.push({ url, init });
      const method = init?.method ?? 'GET';
      if (url === 'http://betting.test/accounts' && method === 'POST') {
        return Promise.resolve(jsonResponse(authResponseFixture()));
      }
      if (url.startsWith('http://betting.test/accounts/')) {
        return Promise.resolve(jsonResponse(accountFixture()));
      }
      if (url.startsWith('http://betting.test/bets?')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url === 'http://pricing.test/markets') {
        return Promise.resolve(jsonResponse([marketFixture()]));
      }
      if (url === 'http://betting.test/bets' && method === 'POST') {
        return Promise.resolve(
          jsonResponse(betFixture({ stake: 500, price: 1.8, potentialReturn: 900 }))
        );
      }
      throw new Error(`unexpected call: ${method} ${url}`);
    };
    const client = new ArenaClient(
      {
        pricingUrl: 'http://pricing.test',
        bettingUrl: 'http://betting.test',
      },
      fetchImpl
    );
    const deps = makeDeps(client);

    const bot = await provisionBot(deps, personality());
    expect(bot).not.toBeNull();
    expect(bot?.token).toBe('bot-session-token');

    const outcome = await runRound(deps, bot!);
    expect(outcome.betsPlaced).toBe(1);
    // betting debited the wallet at placement — the round balance reflects it
    expect(outcome.balance).toBe(9_500);
    expect(outcome.sessionExpired).toBe(false);

    // 1. Provisioning is identity-gated — a signed admin service token (sub
    // 'bots', admin: true), the bot's first and only auth step. No shared key.
    const provisionCall = calls[0];
    expect(provisionCall.url).toBe('http://betting.test/accounts');
    const provisionHeaders = provisionCall.init?.headers as Record<string, string>;
    expect(provisionHeaders).not.toHaveProperty('x-admin-key');
    expect(provisionHeaders.authorization).toMatch(/^Bearer /);
    expect(verifyTokenClaims(provisionHeaders.authorization.slice('Bearer '.length))).toEqual({
      sub: 'bots',
      admin: true,
    });
    expect(JSON.parse(String(provisionCall.init?.body))).toEqual({
      name: 'Steady',
      isBot: true,
    });

    // 2. The returned ACCOUNT token — not the admin token — is reused as the
    // Bearer on every subsequent call.
    for (const call of calls.slice(1)) {
      const headers = call.init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer bot-session-token');
    }

    // 3. The bet body carries a fresh idempotencyKey and NO accountId.
    const betCall = calls.find(
      (call) => call.url === 'http://betting.test/bets' && call.init?.method === 'POST'
    );
    expect(betCall).toBeDefined();
    const betBody = JSON.parse(String(betCall?.init?.body));
    expect(betBody).toEqual({
      marketId: 'fixture-qf-1',
      selectionId: 'sel-france',
      stake: 500,
      acceptedPrice: 1.8,
      idempotencyKey: FIXED_UUID,
    });
    expect(betBody).not.toHaveProperty('accountId');
  });
});

describe('provisionBot', () => {
  it('returns null and promises a retry while betting is still offline', async () => {
    const deps = makeDeps(
      stubClient({
        provisionBot: async () => ({ ok: false, kind: 'network', detail: 'ECONNREFUSED' }),
      })
    );
    expect(await provisionBot(deps, personality())).toBeNull();
    expect(deps.logs.join('\n')).toContain('retrying next round');
  });
});

describe('runRound resilience', () => {
  it('skips the round when the markets are dark, without crashing', async () => {
    const deps = makeDeps(
      stubClient({
        getMarkets: async () => ({ ok: false, kind: 'network', detail: 'ECONNREFUSED' }),
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('skipping the round');
  });

  it('treats a 409 price move as a normal skip, not a failure', async () => {
    const deps = makeDeps(
      stubClient({
        placeBet: async () => ({
          ok: false,
          kind: 'price-moved',
          status: 409,
          detail: 'HTTP 409',
        }),
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('price moved');
  });

  it('holds instead of doubling up when it already has an open bet on the selection', async () => {
    const placeCalls: unknown[] = [];
    const deps = makeDeps(
      stubClient({
        getBets: async () => ({
          ok: true,
          data: [betFixture({ marketId: 'fixture-qf-1', selectionId: 'sel-france' })],
        }),
        placeBet: async (_token, request) => {
          placeCalls.push(request);
          return { ok: true, data: betFixture() };
        },
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(placeCalls).toEqual([]);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('holding, not doubling up');
  });

  it('narrates an unanswered bet as outcome unknown, never as rejected', async () => {
    const deps = makeDeps(
      stubClient({
        placeBet: async () => ({ ok: false, kind: 'network', detail: 'ECONNRESET' }),
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('outcome unknown');
    expect(deps.logs.join('\n')).not.toContain('rejected');
  });

  it('flags an expired session (401) so the runner can re-provision', async () => {
    const expired = { ok: false, kind: 'http', status: 401, detail: 'HTTP 401' } as const;
    const deps = makeDeps(
      stubClient({
        getAccount: async () => expired,
        getBets: async () => expired,
        getMarkets: async () => expired,
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(outcome.sessionExpired).toBe(true);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('re-provision');
  });

  it('logs and moves on when betting rejects the bet outright', async () => {
    const deps = makeDeps(
      stubClient({
        placeBet: async () => ({ ok: false, kind: 'http', status: 400, detail: 'HTTP 400' }),
      })
    );
    const bot = (await provisionBot(deps, personality()))!;

    const outcome = await runRound(deps, bot);
    expect(outcome.betsPlaced).toBe(0);
    expect(deps.logs.join('\n')).toContain('rejected');
  });

  it('keeps the last known balance when the wallet refresh fails', async () => {
    const seen: number[] = [];
    const spy: Strategy = (_markets, bankroll) => {
      seen.push(bankroll);
      return [];
    };
    const deps = makeDeps(
      stubClient({
        getAccount: async () => ({ ok: false, kind: 'http', status: 500, detail: 'HTTP 500' }),
      })
    );
    const bot = (await provisionBot(deps, personality({ strategy: spy })))!;

    await runRound(deps, bot);
    expect(seen).toEqual([10_000]);
    expect(deps.logs.join('\n')).toContain('using last known');
  });

  it('plays memoryless when its bet history cannot be read', async () => {
    const seen: Bet[][] = [];
    const spy: Strategy = (_markets, _bankroll, history) => {
      seen.push(history);
      return [];
    };
    const deps = makeDeps(
      stubClient({
        getBets: async () => ({ ok: false, kind: 'http', status: 500, detail: 'HTTP 500' }),
      })
    );
    const bot = (await provisionBot(deps, personality({ strategy: spy })))!;

    await runRound(deps, bot);
    expect(seen).toEqual([[]]);
    expect(deps.logs.join('\n')).toContain('playing memoryless');
  });
});

describe('runRound strategy wiring', () => {
  it('feeds settled outcomes to the strategy as history and counts open bets', async () => {
    const seen: Array<{ markets: Market[]; history: Bet[] }> = [];
    const spy: Strategy = (markets, _bankroll, history) => {
      seen.push({ markets, history });
      return [];
    };
    const bets = [
      betFixture(),
      betFixture({ status: 'won', settledAt: '2026-07-03T10:00:00.000Z' }),
      betFixture({ status: 'lost', settledAt: '2026-07-03T11:00:00.000Z' }),
    ];
    const deps = makeDeps(stubClient({ getBets: async () => ({ ok: true, data: bets }) }));
    const bot = (await provisionBot(deps, personality({ strategy: spy })))!;

    const outcome = await runRound(deps, bot);

    expect(seen[0].history.map((bet) => bet.status)).toEqual(['won', 'lost']);
    expect(outcome.openBets).toBe(1);
    expect(deps.logs.join('\n')).toContain('sits this round out');
  });
});

describe('defaultUuid', () => {
  it('produces RFC-4122 uuids for idempotency keys', () => {
    expect(defaultUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
