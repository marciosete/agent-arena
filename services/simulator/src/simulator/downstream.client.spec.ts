import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BASE_URLS, type Market, type SettlementEvent } from '@arena/contracts';
import { verifyToken } from '@arena/service-auth';
import { DownstreamClient } from './downstream.client';

const SETTLEMENT: SettlementEvent = {
  fixtureId: 'R32-9',
  winnerTeamId: 'POR',
  homeScore: 2,
  awayScore: 1,
  decidedOnPenalties: false,
  settledAt: '2026-07-03T12:00:00.000Z',
};

const MARKET: Market = {
  id: 'R32-9',
  type: 'MATCH_WINNER',
  fixtureId: 'R32-9',
  name: 'Portugal v Croatia — Match Winner',
  status: 'settled',
  selections: [
    { id: 'px_9f31c2', name: 'Portugal', price: 1.62 },
    { id: 'px_04ab77', name: 'Croatia', price: 3.05 },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('DownstreamClient', () => {
  let fetchMock: Mock;
  let client: DownstreamClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new DownstreamClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PRICING_URL;
    delete process.env.BETTING_URL;
    delete process.env.BETTING_ADMIN_KEY;
  });

  function requestOf(call = 0): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
    return { url, init };
  }

  function headersOf(call = 0): Record<string, string> {
    return requestOf(call).init.headers as Record<string, string>;
  }

  describe('reprice', () => {
    it('POSTs the settlement to pricing with a simulator service token', async () => {
      process.env.PRICING_URL = 'http://pricing.test';
      fetchMock.mockResolvedValue(jsonResponse([MARKET]));

      const markets = await client.reprice(SETTLEMENT);

      expect(markets).toEqual([MARKET]);
      const { url, init } = requestOf();
      expect(url).toBe('http://pricing.test/reprice');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ settlement: SETTLEMENT });
      const headers = headersOf();
      expect(headers['content-type']).toBe('application/json');
      const [scheme, token] = headers.authorization.split(' ');
      expect(scheme).toBe('Bearer');
      expect(verifyToken(token)).toBe('simulator');
    });

    it('falls back to the contract base URL when PRICING_URL is unset', async () => {
      fetchMock.mockResolvedValue(jsonResponse([MARKET]));
      await client.reprice(SETTLEMENT);
      expect(requestOf().url).toBe(`${BASE_URLS.pricing}/reprice`);
    });

    it('rejects when pricing responds non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, false, 503));
      await expect(client.reprice(SETTLEMENT)).rejects.toThrow(/503/);
    });

    it('rejects when the response is not an array of markets', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ markets: [MARKET] }));
      await expect(client.reprice(SETTLEMENT)).rejects.toThrow(/array/);
    });

    it('rejects when a market fails the contract schema', async () => {
      fetchMock.mockResolvedValue(jsonResponse([{ ...MARKET, selections: [] }]));
      await expect(client.reprice(SETTLEMENT)).rejects.toThrow();
    });
  });

  describe('settle', () => {
    const WINNING = [{ marketId: 'R32-9', selectionId: 'px_9f31c2' }];

    it("POSTs the settlement + winning selections with betting's admin key", async () => {
      process.env.BETTING_URL = 'http://betting.test';
      process.env.BETTING_ADMIN_KEY = 'betting-admin';
      fetchMock.mockResolvedValue(jsonResponse({ settledBets: 3, totalPaidOut: 120.5 }));

      const result = await client.settle(SETTLEMENT, WINNING);

      expect(result).toEqual({ settledBets: 3, totalPaidOut: 120.5 });
      const { url, init } = requestOf();
      expect(url).toBe('http://betting.test/settle');
      expect(JSON.parse(String(init.body))).toEqual({
        settlement: SETTLEMENT,
        winningSelections: WINNING,
      });
      const headers = headersOf();
      expect(headers['x-admin-key']).toBe('betting-admin');
      const [, token] = headers.authorization.split(' ');
      expect(verifyToken(token)).toBe('simulator');
    });

    it('omits the admin key header when BETTING_ADMIN_KEY is unset (local dev)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ settledBets: 0, totalPaidOut: 0 }));
      await client.settle(SETTLEMENT, WINNING);
      expect(requestOf().url).toBe(`${BASE_URLS.betting}/settle`);
      expect(headersOf()['x-admin-key']).toBeUndefined();
    });

    it('rejects when betting responds non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 401));
      await expect(client.settle(SETTLEMENT, WINNING)).rejects.toThrow(/401/);
    });

    it('rejects when the settle response fails the contract schema', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ settledBets: -1, totalPaidOut: 0 }));
      await expect(client.settle(SETTLEMENT, WINNING)).rejects.toThrow();
    });
  });
});
