import {
  AccountSchema,
  AuthResponseSchema,
  BetSchema,
  MarketSchema,
  SimStateSchema,
  type Account,
  type AuthResponse,
  type Bet,
  type CreateAccountRequest,
  type Market,
  type PlaceBetRequest,
  type SimState,
} from '@arena/contracts';
import { requestJson, type ApiResult } from './http';
import type { ServiceUrls } from './config';

const JSON_CONTENT = { 'content-type': 'application/json' };

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/**
 * The bots' one HTTP surface onto the platform. Every response is
 * zod-parsed against its @arena/contracts schema before anyone acts on it.
 */
export class ArenaClient {
  constructor(
    private readonly urls: ServiceUrls,
    private readonly adminKey: string
  ) {}

  /**
   * Bots have no inbox: the first and only auth step is this admin-keyed
   * provision call. Keep the returned token for every call after.
   */
  provisionBot(name: string): Promise<ApiResult<AuthResponse>> {
    const body: CreateAccountRequest = { name, isBot: true };
    return requestJson(AuthResponseSchema, `${this.urls.betting}/accounts`, {
      method: 'POST',
      headers: { ...JSON_CONTENT, 'x-admin-key': this.adminKey },
      body: JSON.stringify(body),
    });
  }

  getMarkets(token: string): Promise<ApiResult<Market[]>> {
    return requestJson(MarketSchema.array(), `${this.urls.pricing}/markets`, {
      headers: bearer(token),
    });
  }

  placeBet(token: string, bet: PlaceBetRequest): Promise<ApiResult<Bet>> {
    return requestJson(BetSchema, `${this.urls.betting}/bets`, {
      method: 'POST',
      headers: { ...JSON_CONTENT, ...bearer(token) },
      body: JSON.stringify(bet),
    });
  }

  getAccount(token: string, accountId: string): Promise<ApiResult<Account>> {
    return requestJson(AccountSchema, `${this.urls.betting}/accounts/${accountId}`, {
      headers: bearer(token),
    });
  }

  getBets(token: string, accountId: string): Promise<ApiResult<Bet[]>> {
    const query = new URLSearchParams({ accountId });
    return requestJson(BetSchema.array(), `${this.urls.betting}/bets?${query}`, {
      headers: bearer(token),
    });
  }

  getSimState(token: string): Promise<ApiResult<SimState>> {
    return requestJson(SimStateSchema, `${this.urls.simulator}/state`, {
      headers: bearer(token),
    });
  }
}
