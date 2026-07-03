import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { BASE_URLS } from '@arena/contracts';
import { verifyToken } from '@arena/service-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingClient } from './pricing-client.service';

const MARKET_ID = 'qf-1';
const MARKET = {
  id: MARKET_ID,
  type: 'MATCH_WINNER',
  fixtureId: MARKET_ID,
  name: 'Brazil vs Argentina — Match Winner',
  status: 'open',
  selections: [
    { id: 'sel-bra', name: 'Brazil', price: 1.8 },
    { id: 'sel-arg', name: 'Argentina', price: 2.2 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('PricingClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PricingClient;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(MARKET));
    vi.stubGlobal('fetch', fetchMock);
    client = new PricingClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PRICING_URL;
  });

  it('fetches a match market from pricing by its derivable fixture id', async () => {
    const market = await client.fetchMarket(MARKET_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URLS.pricing}/markets/${MARKET_ID}`);
    expect(market.id).toBe(MARKET_ID);
    expect(market.selections).toHaveLength(2);
  });

  it("fetches the outright market from /outright when marketId is 'outright'", async () => {
    const outright = { ...MARKET, id: 'outright', type: 'OUTRIGHT', fixtureId: null };
    fetchMock.mockResolvedValue(jsonResponse(outright));

    await client.fetchMarket('outright');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URLS.pricing}/outright`);
  });

  it("authenticates with a signed 'betting' service token, not a user session", async () => {
    await client.fetchMarket(MARKET_ID);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    const [scheme, token] = String(headers.authorization).split(' ');
    expect(scheme).toBe('Bearer');
    expect(verifyToken(token)).toBe('betting');
  });

  it('honours the PRICING_URL environment override', async () => {
    process.env.PRICING_URL = 'https://pricing.example.com';

    await client.fetchMarket(MARKET_ID);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://pricing.example.com/markets/${MARKET_ID}`);
  });

  it('maps a pricing 404 to NotFound (unknown market)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 404));

    await expect(client.fetchMarket('no-such-market')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps any other pricing failure to BadGateway', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(client.fetchMarket(MARKET_ID)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps an unreachable pricing service to BadGateway', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.fetchMarket(MARKET_ID)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a response that does not parse as a contract Market', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: MARKET_ID, selections: [] }));

    await expect(client.fetchMarket(MARKET_ID)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a market whose id does not match the one requested', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...MARKET, id: 'sf-1', fixtureId: 'sf-1' }));

    await expect(client.fetchMarket(MARKET_ID)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
