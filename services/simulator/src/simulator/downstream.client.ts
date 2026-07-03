import { Injectable } from '@nestjs/common';
import {
  BASE_URLS,
  MarketSchema,
  SettleResponseSchema,
  type Market,
  type RepriceRequest,
  type SettleRequest,
  type SettleResponse,
  type SettlementEvent,
} from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import type { WinningSelection } from './winning-selections';

/**
 * The simulator's one outbound surface: pricing `POST /reprice` then betting
 * `POST /settle` after every result. Base URLs resolve env-first (deploys set
 * PRICING_URL/BETTING_URL; local dev falls back to the contract defaults),
 * every call carries a freshly-minted `signToken('simulator')` service JWT,
 * and every response is zod-parsed against the contract before use.
 */
/** A hung downstream must degrade like a down one, not freeze the run loop. */
const REQUEST_TIMEOUT_MS = 5_000;

@Injectable()
export class DownstreamClient {
  async reprice(settlement: SettlementEvent): Promise<Market[]> {
    const body: RepriceRequest = { settlement };
    const baseUrl = process.env.PRICING_URL ?? BASE_URLS.pricing;
    return MarketSchema.array().parse(await this.post(`${baseUrl}/reprice`, body));
  }

  async settle(
    settlement: SettlementEvent,
    winningSelections: WinningSelection[]
  ): Promise<SettleResponse> {
    const body: SettleRequest = { settlement, winningSelections };
    const baseUrl = process.env.BETTING_URL ?? BASE_URLS.betting;
    // Settlement moves money: betting requires its admin key on top of the JWT.
    const adminKey = process.env.BETTING_ADMIN_KEY;
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    return SettleResponseSchema.parse(await this.post(`${baseUrl}/settle`, body, headers));
  }

  private async post(
    url: string,
    body: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${signToken('simulator')}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`POST ${url} responded ${response.status}`);
    }
    return response.json();
  }
}
