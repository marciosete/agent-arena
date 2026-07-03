import { Injectable } from '@nestjs/common';
import {
  BASE_URLS,
  MarketSchema,
  ResetResponseSchema,
  SettleResponseSchema,
  type Market,
  type RepriceRequest,
  type ResetResponse,
  type SettleRequest,
  type SettleResponse,
  type SettlementEvent,
} from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import type { WinningSelection } from './winning-selections';

/**
 * The simulator's outbound surface: the per-fixture finale chain (pricing
 * `POST /reprice` → betting `POST /settle`) and the Reset-bracket cascade
 * (pricing `POST /reset` + betting `POST /reset`). Base URLs resolve env-first
 * (deploys set PRICING_URL/BETTING_URL; local dev falls back to the contract
 * defaults), every call carries a freshly-minted admin service JWT
 * (`signToken('simulator', { admin: true })`) — authority is identity, so
 * there are no shared admin keys — and every response is zod-parsed against the
 * contract before use.
 */
/** A hung downstream must degrade like a down one, not freeze the run loop. */
const REQUEST_TIMEOUT_MS = 5_000;

@Injectable()
export class DownstreamClient {
  async reprice(settlement: SettlementEvent): Promise<Market[]> {
    const body: RepriceRequest = { settlement };
    return MarketSchema.array().parse(await this.post(`${this.pricingUrl()}/reprice`, body));
  }

  async settle(
    settlement: SettlementEvent,
    winningSelections: WinningSelection[]
  ): Promise<SettleResponse> {
    const body: SettleRequest = { settlement, winningSelections };
    // Settlement moves money, but admin authority now rides in the service
    // token's `admin` claim — no x-admin-key header.
    return SettleResponseSchema.parse(await this.post(`${this.bettingUrl()}/settle`, body));
  }

  /** Reset-bracket cascade: pricing clears + re-seeds fresh OPEN markets. */
  async resetPricing(): Promise<Market[]> {
    return MarketSchema.array().parse(await this.post(`${this.pricingUrl()}/reset`, {}));
  }

  /** Reset-bracket cascade: betting voids bets, resets wallets, drops bots. */
  async resetBetting(): Promise<ResetResponse> {
    return ResetResponseSchema.parse(await this.post(`${this.bettingUrl()}/reset`, {}));
  }

  private pricingUrl(): string {
    return process.env.PRICING_URL ?? BASE_URLS.pricing;
  }

  private bettingUrl(): string {
    return process.env.BETTING_URL ?? BASE_URLS.betting;
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${signToken('simulator', { admin: true })}`,
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
