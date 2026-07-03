import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { BASE_URLS, MarketSchema, type Market } from '@arena/contracts';
import { signToken } from '@arena/service-auth';

/** Market ids are derivable: the outright market's id is this fixed string. */
export const OUTRIGHT_MARKET_ID = 'outright';

const FETCH_TIMEOUT_MS = 5_000;

/**
 * Betting → pricing lookup used to validate a bet against the LIVE market
 * (integration.md §5): a real HTTP call authenticated with a short-lived
 * `signToken('betting')` service token. A MATCH_WINNER market's id equals its
 * fixtureId, so any marketId resolves directly — `GET /markets/:fixtureId` or
 * `GET /outright` — without scanning the full list.
 */
@Injectable()
export class PricingClient {
  async fetchMarket(marketId: string): Promise<Market> {
    const base = process.env.PRICING_URL ?? BASE_URLS.pricing;
    const path =
      marketId === OUTRIGHT_MARKET_ID ? '/outright' : `/markets/${encodeURIComponent(marketId)}`;

    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${signToken('betting')}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('Pricing service is unreachable');
    }

    if (response.status === 404) {
      throw new NotFoundException(`Market ${marketId} not found`);
    }
    if (!response.ok) {
      throw new BadGatewayException('Pricing service rejected the market lookup');
    }

    const market = MarketSchema.safeParse(await response.json().catch(() => null));
    if (!market.success || market.data.id !== marketId) {
      throw new BadGatewayException('Pricing returned an invalid market');
    }
    return market.data;
  }
}
