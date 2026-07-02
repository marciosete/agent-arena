import { OPENING_BALANCE } from '@arena/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bot, type BotSpec } from '../bot';
import { ArenaClient } from '../client';
import type { IntendedBet, Strategy } from '../strategies/types';
import { account, ACCOUNT_ID, bet } from './fixtures';

const URLS = {
  pricing: 'http://price.test',
  betting: 'http://bet.test',
  simulator: 'http://sim.test',
};
const ADMIN_KEY = 'test-admin-key';
const TOKEN = 'bot-token';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const intent: IntendedBet = {
  marketId: 'm1',
  selectionId: 'm1-home',
  selectionName: 'France',
  price: 1.3,
  stake: 1000,
  reason: 'value all day',
};

type Routes = Record<string, (init?: RequestInit) => Response>;

/** Happy-path platform: provision, account, bets, markets, bet acceptance. */
function platformRoutes(overrides: Routes = {}): Routes {
  return {
    [`POST ${URLS.betting}/accounts`]: () => Response.json({ token: TOKEN, account: account() }),
    [`GET ${URLS.betting}/accounts/${ACCOUNT_ID}`]: () => Response.json(account()),
    [`GET ${URLS.betting}/bets?accountId=${ACCOUNT_ID}`]: () => Response.json([]),
    [`GET ${URLS.pricing}/markets`]: () => Response.json([]),
    [`POST ${URLS.betting}/bets`]: () =>
      Response.json(bet({ stake: intent.stake, price: intent.price, potentialReturn: 1300 })),
    ...overrides,
  };
}

function stubPlatform(routes: Routes) {
  const calls: Array<{ key: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(url)}`;
    calls.push({ key, init });
    const handler = routes[key];
    if (!handler) throw new Error(`unrouted request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function makeBot(strategy: Strategy, spec: Partial<BotSpec> = {}) {
  const logs: string[] = [];
  const client = new ArenaClient(URLS, ADMIN_KEY);
  const bot = new Bot({ name: 'Sharp', emoji: '📐', strategy, ...spec }, client, (line) =>
    logs.push(line)
  );
  return { bot, logs };
}

function requestBody(call: { init?: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init?.body));
}

function requestHeaders(call: { init?: RequestInit }): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Bot', () => {
  it('provisions itself with the admin key and places an accepted bet with the reused bearer token', async () => {
    const calls = stubPlatform(platformRoutes());
    const { bot, logs } = makeBot(() => [intent]);

    await bot.playRound();

    // Provisioning: admin-keyed, isBot body, and no bearer — it IS the auth step.
    const provision = calls.find((c) => c.key === `POST ${URLS.betting}/accounts`);
    expect(provision).toBeDefined();
    expect(requestHeaders(provision!)['x-admin-key']).toBe(ADMIN_KEY);
    expect(requestHeaders(provision!).authorization).toBeUndefined();
    expect(requestBody(provision!)).toEqual({ name: 'Sharp', isBot: true });

    // The bet reuses the provisioned token and carries an idempotency key but NO accountId.
    const placed = calls.find((c) => c.key === `POST ${URLS.betting}/bets`);
    expect(placed).toBeDefined();
    expect(requestHeaders(placed!).authorization).toBe(`Bearer ${TOKEN}`);
    const body = requestBody(placed!);
    expect(body).not.toHaveProperty('accountId');
    expect(body.idempotencyKey).toMatch(UUID_RE);
    expect(body).toMatchObject({
      marketId: 'm1',
      selectionId: 'm1-home',
      stake: 1000,
      acceptedPrice: 1.3,
    });
    expect(logs.some((line) => line.includes('$1000 on France @ 1.3'))).toBe(true);
  });

  it('provisions once, then sends a fresh idempotency key on every attempt', async () => {
    const calls = stubPlatform(platformRoutes());
    const { bot } = makeBot(() => [intent]);

    await bot.playRound();
    await bot.playRound();

    const provisions = calls.filter((c) => c.key === `POST ${URLS.betting}/accounts`);
    expect(provisions).toHaveLength(1);
    const keys = calls
      .filter((c) => c.key === `POST ${URLS.betting}/bets`)
      .map((c) => requestBody(c).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('treats a 409 (price moved) as a normal skip, not a crash', async () => {
    stubPlatform(
      platformRoutes({
        [`POST ${URLS.betting}/bets`]: () => new Response('price moved', { status: 409 }),
      })
    );
    const { bot, logs } = makeBot(() => [intent]);

    await expect(bot.playRound()).resolves.toBeUndefined();
    expect(logs.some((line) => line.includes('price moved on France'))).toBe(true);
    expect(bot.snapshot().openBets).toBe(0);
  });

  it('logs a rejected bet (non-409) and moves on', async () => {
    stubPlatform(
      platformRoutes({
        [`POST ${URLS.betting}/bets`]: () => new Response('insufficient funds', { status: 400 }),
      })
    );
    const { bot, logs } = makeBot(() => [intent]);

    await expect(bot.playRound()).resolves.toBeUndefined();
    expect(logs.some((line) => line.includes('bounced') && line.includes('400'))).toBe(true);
    expect(bot.snapshot().openBets).toBe(0);
  });

  it('waits patiently when betting is not up yet (provision refused)', async () => {
    const calls = stubPlatform({
      [`POST ${URLS.betting}/accounts`]: () => {
        throw new TypeError('fetch failed: ECONNREFUSED');
      },
    });
    const { bot, logs } = makeBot(() => [intent]);

    await expect(bot.playRound()).resolves.toBeUndefined();
    expect(calls).toHaveLength(1); // stopped at provisioning; no other calls
    expect(logs.some((line) => line.includes('waiting for betting'))).toBe(true);
    expect(bot.token).toBeNull();
    expect(bot.snapshot()).toMatchObject({ balance: OPENING_BALANCE, pnl: 0 });
  });

  it('skips the round when balance, history or markets cannot be fetched', async () => {
    const failures = [
      `GET ${URLS.betting}/accounts/${ACCOUNT_ID}`,
      `GET ${URLS.betting}/bets?accountId=${ACCOUNT_ID}`,
      `GET ${URLS.pricing}/markets`,
    ];
    for (const failing of failures) {
      const calls = stubPlatform(
        platformRoutes({ [failing]: () => new Response('down', { status: 503 }) })
      );
      const { bot } = makeBot(() => [intent]);
      await expect(bot.playRound()).resolves.toBeUndefined();
      expect(calls.some((c) => c.key === `POST ${URLS.betting}/bets`)).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('says so when the strategy finds nothing', async () => {
    stubPlatform(platformRoutes());
    const { bot, logs } = makeBot(() => []);
    await bot.playRound();
    expect(logs.some((line) => line.includes('nothing I like'))).toBe(true);
  });

  it('reports live balance, open bets and P&L in its snapshot', async () => {
    stubPlatform(
      platformRoutes({
        [`GET ${URLS.betting}/accounts/${ACCOUNT_ID}`]: () =>
          Response.json(account({ balance: 12_345.5 })),
        [`GET ${URLS.betting}/bets?accountId=${ACCOUNT_ID}`]: () =>
          Response.json([bet(), bet({ status: 'lost', settledAt: '2026-07-03T10:00:00.000Z' })]),
      })
    );
    const { bot } = makeBot(() => []);
    await bot.playRound();
    expect(bot.snapshot()).toEqual({
      emoji: '📐',
      name: 'Sharp',
      balance: 12_345.5,
      openBets: 1,
      pnl: 2_345.5,
    });
  });
});
