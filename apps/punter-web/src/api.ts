import {
  BetSchema,
  FeatureFlagSchema,
  MarketSchema,
  SimStateSchema,
  type Bet,
  type FeatureFlag,
  type Market,
  type PlaceBetRequest,
  type SimState,
} from '@arena/contracts';
import { SERVICE_URLS } from './config';

/**
 * Typed fetch layer: every response is zod-parsed against the contract schemas,
 * and every failure (network, non-2xx, malformed payload) degrades to `null` —
 * the services are built in parallel and may be down; the UI never crashes on them.
 *
 * All calls go through the session-bound `apiFetch` from `@arena/web-auth`
 * (passed in as `Fetcher`), which attaches the Bearer JWT. `/health` is the one
 * public endpoint and uses plain `fetch`.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface SchemaLike<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

async function getParsed<T>(
  fetcher: Fetcher,
  url: string,
  schema: SchemaLike<T>
): Promise<T | null> {
  try {
    const response = await fetcher(url);
    if (!response.ok) {
      return null;
    }
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getFlags(fetcher: Fetcher): Promise<FeatureFlag[] | null> {
  return getParsed(fetcher, `${SERVICE_URLS.flags}/flags`, FeatureFlagSchema.array());
}

export function getSimState(fetcher: Fetcher): Promise<SimState | null> {
  return getParsed(fetcher, `${SERVICE_URLS.simulator}/state`, SimStateSchema);
}

export function getMarkets(fetcher: Fetcher): Promise<Market[] | null> {
  return getParsed(fetcher, `${SERVICE_URLS.pricing}/markets`, MarketSchema.array());
}

export function getOutright(fetcher: Fetcher): Promise<Market | null> {
  return getParsed(fetcher, `${SERVICE_URLS.pricing}/outright`, MarketSchema);
}

/** A MATCH_WINNER market's id equals its fixtureId; the outright's id is 'outright'. */
export function getMarket(fetcher: Fetcher, marketId: string): Promise<Market | null> {
  if (marketId === 'outright') {
    return getOutright(fetcher);
  }
  return getParsed(fetcher, `${SERVICE_URLS.pricing}/markets/${marketId}`, MarketSchema);
}

export function getBets(fetcher: Fetcher, accountId: string): Promise<Bet[] | null> {
  return getParsed(
    fetcher,
    `${SERVICE_URLS.betting}/bets?accountId=${encodeURIComponent(accountId)}`,
    BetSchema.array()
  );
}

export type PlaceBetResult =
  { kind: 'placed'; bet: Bet } | { kind: 'price-moved' } | { kind: 'error'; message: string };

const PLACE_FAILED = 'The bet could not be placed. Please try again.';

export async function placeBet(
  fetcher: Fetcher,
  request: PlaceBetRequest
): Promise<PlaceBetResult> {
  try {
    const response = await fetcher(`${SERVICE_URLS.betting}/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === 409) {
      return { kind: 'price-moved' };
    }
    if (!response.ok) {
      return { kind: 'error', message: await readErrorMessage(response) };
    }
    const parsed = BetSchema.safeParse(await response.json());
    return parsed.success
      ? { kind: 'placed', bet: parsed.data }
      : { kind: 'error', message: PLACE_FAILED };
  } catch {
    return { kind: 'error', message: 'The betting service is unreachable. Please try again.' };
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
      if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
        return message.join('; ');
      }
    }
  } catch {
    /* fall through to the generic message */
  }
  return PLACE_FAILED;
}

/** `/health` is public — no token. Bounded so one hung service can't freeze the board. */
export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}
