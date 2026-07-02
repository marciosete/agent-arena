import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { BASE_URLS, MarketSchema, type Market } from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import { resolveMarketPath } from '../bets/domain';

const PRICING_UNAVAILABLE = 'Pricing service unavailable';

/**
 * The one runtime call betting makes to another service (integration.md §2):
 * fetch the live market at bet time to validate that it is open and that the
 * price has not moved. Authenticates with a short-lived service token
 * (`signToken('betting')`); the response is parsed against the contract
 * schema before anything downstream trusts it.
 */
@Injectable()
export class PricingClient {
  async fetchMarket(marketId: string): Promise<Market> {
    const baseUrl = process.env.PRICING_URL ?? BASE_URLS.pricing;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${resolveMarketPath(marketId)}`, {
        headers: { authorization: `Bearer ${signToken('betting')}` },
      });
    } catch {
      throw new BadGatewayException(PRICING_UNAVAILABLE);
    }

    if (response.status === 404) {
      throw new NotFoundException(`Market ${marketId} not found`);
    }
    if (!response.ok) {
      throw new BadGatewayException(PRICING_UNAVAILABLE);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BadGatewayException(PRICING_UNAVAILABLE);
    }
    const parsed = MarketSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadGatewayException(PRICING_UNAVAILABLE);
    }
    return parsed.data;
  }
}
