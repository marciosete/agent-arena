import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { BASE_URLS, type Market } from '@arena/contracts';
import { verifyToken } from '@arena/service-auth';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingClient } from './pricing-client';

/** The ambient value (a developer's deployed-topology override) to restore. */
const ORIGINAL_PRICING_URL = process.env.PRICING_URL;

const OPEN_MARKET: Market = {
  id: 'r16-1',
  type: 'MATCH_WINNER',
  fixtureId: 'r16-1',
  name: 'Brazil v Chile — Match Winner',
  status: 'open',
  selections: [
    { id: 'sel-bra', name: 'Brazil', price: 1.55 },
    { id: 'sel-chi', name: 'Chile', price: 2.4 },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PricingClient', () => {
  let client: PricingClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    client = new PricingClient();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.PRICING_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    if (ORIGINAL_PRICING_URL === undefined) {
      delete process.env.PRICING_URL;
    } else {
      process.env.PRICING_URL = ORIGINAL_PRICING_URL;
    }
  });

  it('fetches the match-winner market for a fixture-derived market id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    const market = await client.fetchMarket('r16-1');

    expect(market).toEqual(OPEN_MARKET);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URLS.pricing}/markets/r16-1`,
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  it("fetches /outright for the fixed 'outright' market id", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...OPEN_MARKET, id: 'outright', fixtureId: null }));

    await client.fetchMarket('outright');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URLS.pricing}/outright`, expect.anything());
  });

  it("sends a service token signed as 'betting' in the Authorization header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    await client.fetchMarket('r16-1');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const authorization = (init.headers as Record<string, string>).authorization;
    const [scheme, token] = authorization.split(' ');
    expect(scheme).toBe('Bearer');
    expect(verifyToken(token)).toBe('betting');
  });

  it('honours the PRICING_URL environment override (deployed topology)', async () => {
    process.env.PRICING_URL = 'https://pricing.example.test';
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    await client.fetchMarket('r16-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pricing.example.test/markets/r16-1',
      expect.anything()
    );
  });

  it('falls back to the default URL when PRICING_URL is set but EMPTY (.env copied as-is)', async () => {
    process.env.PRICING_URL = '';
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    await client.fetchMarket('r16-1');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URLS.pricing}/markets/r16-1`, expect.anything());
  });

  it('strips a pasted trailing slash so routes never see a double slash', async () => {
    process.env.PRICING_URL = 'https://pricing.example.test/';
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    await client.fetchMarket('r16-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pricing.example.test/markets/r16-1',
      expect.anything()
    );
  });

  it('bounds every request with an abort timeout so a hung pricing cannot wedge bets', async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPEN_MARKET));

    await client.fetchMarket('r16-1');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a pricing 404 to NotFoundException (unknown market)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'no such market' }, 404));

    await expect(client.fetchMarket('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps a pricing 5xx to BadGatewayException', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    await expect(client.fetchMarket('r16-1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps a network failure to BadGatewayException', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.fetchMarket('r16-1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a response that is not a contract-valid Market (parse, do not trust)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'r16-1', selections: [] }));

    await expect(client.fetchMarket('r16-1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a non-JSON response body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway error</html>', { status: 200 }));

    await expect(client.fetchMarket('r16-1')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
