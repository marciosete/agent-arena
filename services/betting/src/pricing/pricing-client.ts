import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { BASE_URLS, MarketSchema, type Market } from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import { resolveMarketPath } from '../bets/domain';

const PRICING_UNAVAILABLE = 'Pricing service unavailable';

/** A hung pricing service must fail bets fast (502), not wedge them forever. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Tolerate the two classic env-var footguns: `PRICING_URL=` set-but-empty
 * (dotenv makes it '', which `??` would keep) and a pasted trailing slash
 * (which would 404 as a `//markets/...` route).
 */
function pricingBaseUrl(): string {
  let baseUrl: string = process.env.PRICING_URL || BASE_URLS.pricing;
  while (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  return baseUrl;
}

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
    let response: Response;
    try {
      response = await fetch(`${pricingBaseUrl()}${resolveMarketPath(marketId)}`, {
        headers: { authorization: `Bearer ${signToken('betting')}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
