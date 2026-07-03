import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_URLS, RepriceRequestSchema, SettleRequestSchema } from '@arena/contracts';
import { verifyToken } from '@arena/service-auth';
import { DownstreamClient } from './downstream.client';
import { SETTLE_OK } from './testing/fake-downstream';
import { jsonResponse } from './testing/http';
import { matchWinnerMarket, outrightMarket, settlementFor } from './testing/markets';

const FIXTURE_ID = 'R32-9';

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestOf(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

function headersOf(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

describe('DownstreamClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PRICING_URL;
    delete process.env.BETTING_URL;
    delete process.env.BETTING_ADMIN_KEY;
  });

  describe('reprice', () => {
    const markets = [matchWinnerMarket(FIXTURE_ID, 'POR', 'CRO'), outrightMarket(['POR', 'CRO'])];

    it('POSTs the contract-shaped RepriceRequest to pricing with a simulator service token', async () => {
      const fetchMock = stubFetch(jsonResponse(markets));
      const settlement = settlementFor(FIXTURE_ID, 'POR');

      await new DownstreamClient().reprice(settlement);

      const { url, init } = requestOf(fetchMock);
      expect(url).toBe(`${BASE_URLS.pricing}/reprice`);
      expect(init.method).toBe('POST');
      const headers = headersOf(init);
      expect(headers['content-type']).toBe('application/json');
      const [, token] = String(headers.authorization).split(' ');
      expect(verifyToken(token ?? '')).toBe('simulator');
      expect(RepriceRequestSchema.parse(JSON.parse(String(init.body)))).toEqual({ settlement });
      // A hung downstream must abort, not freeze the finale chain.
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('returns the zod-parsed Market[] pricing responded with', async () => {
      stubFetch(jsonResponse(markets));
      await expect(
        new DownstreamClient().reprice(settlementFor(FIXTURE_ID, 'POR'))
      ).resolves.toEqual(markets);
    });

    it('prefers PRICING_URL from the environment over the contract default', async () => {
      process.env.PRICING_URL = 'https://pricing.example.test';
      const fetchMock = stubFetch(jsonResponse(markets));

      await new DownstreamClient().reprice(settlementFor(FIXTURE_ID, 'POR'));

      expect(requestOf(fetchMock).url).toBe('https://pricing.example.test/reprice');
    });

    it('rejects when pricing responds non-2xx', async () => {
      stubFetch(jsonResponse({ message: 'boom' }, 500));
      await expect(
        new DownstreamClient().reprice(settlementFor(FIXTURE_ID, 'POR'))
      ).rejects.toThrow(/responded 500/);
    });

    it('rejects when the response does not match the Market contract', async () => {
      stubFetch(jsonResponse([{ id: 'R32-9', selections: [] }]));
      await expect(
        new DownstreamClient().reprice(settlementFor(FIXTURE_ID, 'POR'))
      ).rejects.toThrow();
    });
  });

  describe('settle', () => {
    const winningSelections = [{ marketId: FIXTURE_ID, selectionId: 'px-sel-1' }];

    it('POSTs the contract-shaped SettleRequest to betting with token + admin key', async () => {
      process.env.BETTING_ADMIN_KEY = 'betting-admin-secret';
      const fetchMock = stubFetch(jsonResponse(SETTLE_OK));
      const settlement = settlementFor(FIXTURE_ID, 'POR');

      const result = await new DownstreamClient().settle(settlement, winningSelections);

      const { url, init } = requestOf(fetchMock);
      expect(url).toBe(`${BASE_URLS.betting}/settle`);
      const headers = headersOf(init);
      expect(headers['x-admin-key']).toBe('betting-admin-secret');
      const [, token] = String(headers.authorization).split(' ');
      expect(verifyToken(token ?? '')).toBe('simulator');
      expect(SettleRequestSchema.parse(JSON.parse(String(init.body)))).toEqual({
        settlement,
        winningSelections,
      });
      expect(result).toEqual(SETTLE_OK);
    });

    it('omits x-admin-key when BETTING_ADMIN_KEY is not configured (local dev)', async () => {
      const fetchMock = stubFetch(jsonResponse(SETTLE_OK));

      await new DownstreamClient().settle(settlementFor(FIXTURE_ID, 'POR'), winningSelections);

      expect(headersOf(requestOf(fetchMock).init)['x-admin-key']).toBeUndefined();
    });

    it('prefers BETTING_URL from the environment over the contract default', async () => {
      process.env.BETTING_URL = 'https://betting.example.test';
      const fetchMock = stubFetch(jsonResponse(SETTLE_OK));

      await new DownstreamClient().settle(settlementFor(FIXTURE_ID, 'POR'), winningSelections);

      expect(requestOf(fetchMock).url).toBe('https://betting.example.test/settle');
    });

    it('rejects when betting responds non-2xx', async () => {
      stubFetch(jsonResponse({ message: 'nope' }, 403));
      await expect(
        new DownstreamClient().settle(settlementFor(FIXTURE_ID, 'POR'), winningSelections)
      ).rejects.toThrow(/responded 403/);
    });

    it('rejects when the response does not match the SettleResponse contract', async () => {
      stubFetch(jsonResponse({ settledBets: -1, totalPaidOut: 0 }));
      await expect(
        new DownstreamClient().settle(settlementFor(FIXTURE_ID, 'POR'), winningSelections)
      ).rejects.toThrow();
    });
  });
});
