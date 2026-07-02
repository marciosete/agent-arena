import { Injectable, Logger } from '@nestjs/common';
import {
  BASE_URLS,
  MarketSchema,
  SettleResponseSchema,
  type Market,
  type SettleResponse,
  type SettlementEvent,
} from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import type { WinningSelection } from './engine';

/**
 * The simulator's one outbound surface: pricing `POST /reprice` then betting
 * `POST /settle` after every result. Thin by design — base URLs resolve
 * env-first, every call carries a fresh service token, betting additionally
 * gets its admin key (settlement moves money), and every response is
 * zod-parsed before anyone trusts it.
 */

/** A hung downstream service must not wedge the finale chain. */
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class DownstreamClient {
  private readonly logger = new Logger(DownstreamClient.name);
  private warnedMissingBettingKey = false;

  /** Reprice after a result; returns the updated markets to resolve winners from. */
  async reprice(settlement: SettlementEvent): Promise<Market[]> {
    const pricingUrl = process.env.PRICING_URL ?? BASE_URLS.pricing;
    const body = await this.post(`${pricingUrl}/reprice`, { settlement });
    return MarketSchema.array().parse(body);
  }

  /** Settle bets for a result; requires betting's admin key on top of the JWT. */
  async settle(
    settlement: SettlementEvent,
    winningSelections: WinningSelection[]
  ): Promise<SettleResponse> {
    const bettingUrl = process.env.BETTING_URL ?? BASE_URLS.betting;
    const adminKey = process.env.BETTING_ADMIN_KEY;
    if (!adminKey && !this.warnedMissingBettingKey) {
      // Loud once: wherever betting enforces its key, every /settle would 401
      // and the finale would silently never pay a bet out.
      this.warnedMissingBettingKey = true;
      this.logger.warn(
        'BETTING_ADMIN_KEY is not set — betting will reject /settle in any environment that enforces it'
      );
    }
    const body = await this.post(
      `${bettingUrl}/settle`,
      { settlement, winningSelections },
      adminKey ? { 'x-admin-key': adminKey } : {}
    );
    return SettleResponseSchema.parse(body);
  }

  private async post(
    url: string,
    payload: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${signToken('simulator')}`,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`POST ${url} responded ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  }
}
