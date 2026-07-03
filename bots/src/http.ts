import {
  AccountSchema,
  AuthResponseSchema,
  BetSchema,
  MarketSchema,
  type Account,
  type AuthResponse,
  type Bet,
  type CreateAccountRequest,
  type Market,
  type PlaceBetRequest,
} from '@arena/contracts';
import { signToken } from '@arena/service-auth';

/**
 * Thin HTTP client for the arena services. Every response is zod-parsed
 * against its @arena/contracts schema, and every failure mode — connection
 * refused, 4xx/5xx, malformed body — comes back as a value, never a throw,
 * so a bot can skip the round and retry next tick while the other services
 * are still being built.
 */

/**
 * Structural view of a zod schema. The root workspace hoists zod v4 while
 * contracts pin v3, so bots never import zod directly — they use the contract
 * schemas' own methods and type them by shape.
 */
export interface SchemaLike<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type HttpFailureKind = 'network' | 'http' | 'price-moved' | 'contract';

export type HttpResult<T> =
  { ok: true; data: T } | { ok: false; kind: HttpFailureKind; status?: number; detail: string };

export interface ClientConfig {
  pricingUrl: string;
  bettingUrl: string;
  /** per-request timeout; a black-holed call must never stall the roster loop */
  requestTimeoutMs?: number;
}

export const REQUEST_TIMEOUT_MS = 10_000;

/** What the bot framework needs from a client — lets tests stub it flat. */
export interface BotClient {
  provisionBot(name: string): Promise<HttpResult<AuthResponse>>;
  getMarkets(token: string): Promise<HttpResult<Market[]>>;
  getAccount(token: string, accountId: string): Promise<HttpResult<Account>>;
  getBets(token: string, accountId: string): Promise<HttpResult<Bet[]>>;
  placeBet(token: string, request: PlaceBetRequest): Promise<HttpResult<Bet>>;
}

const MarketListSchema = MarketSchema.array();
const BetListSchema = BetSchema.array();

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ArenaClient implements BotClient {
  constructor(
    private readonly config: ClientConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  /**
   * Bot provisioning — the roster's first and only auth step (no inbox, no OTP).
   * Admin-gated by IDENTITY: we mint an admin service token off the shared
   * SESSION_SECRET (@arena/service-auth) and send it as the Bearer. Its
   * unforgeable `admin` claim is what unlocks POST /accounts — no shared key.
   */
  provisionBot(name: string): Promise<HttpResult<AuthResponse>> {
    const body: CreateAccountRequest = { name, isBot: true };
    const adminToken = signToken('bots', { admin: true });
    return this.request(AuthResponseSchema, `${this.config.bettingUrl}/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(adminToken) },
      body: JSON.stringify(body),
    });
  }

  getMarkets(token: string): Promise<HttpResult<Market[]>> {
    return this.request(MarketListSchema, `${this.config.pricingUrl}/markets`, {
      headers: bearer(token),
    });
  }

  getAccount(token: string, accountId: string): Promise<HttpResult<Account>> {
    return this.request(
      AccountSchema,
      `${this.config.bettingUrl}/accounts/${encodeURIComponent(accountId)}`,
      { headers: bearer(token) }
    );
  }

  getBets(token: string, accountId: string): Promise<HttpResult<Bet[]>> {
    return this.request(
      BetListSchema,
      `${this.config.bettingUrl}/bets?accountId=${encodeURIComponent(accountId)}`,
      { headers: bearer(token) }
    );
  }

  /** A 409 (price moved / market closed) comes back as kind 'price-moved' — a normal skip. */
  placeBet(token: string, request: PlaceBetRequest): Promise<HttpResult<Bet>> {
    return this.request(BetSchema, `${this.config.bettingUrl}/bets`, {
      method: 'POST',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  private async request<T>(
    schema: SchemaLike<T>,
    url: string,
    init: RequestInit
  ): Promise<HttpResult<T>> {
    const method = init.method ?? 'GET';
    const timeoutMs = this.config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      return {
        ok: false,
        kind: 'network',
        detail: `${method} ${url} unreachable: ${errorMessage(error)}`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: response.status === 409 ? 'price-moved' : 'http',
        status: response.status,
        detail: `${method} ${url} → HTTP ${response.status}`,
      };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        ok: false,
        kind: 'contract',
        detail: `${method} ${url} returned non-JSON: ${errorMessage(error)}`,
      };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        kind: 'contract',
        detail: `${method} ${url} response failed its @arena/contracts schema`,
      };
    }
    return { ok: true, data: parsed.data };
  }
}
