import { z } from 'zod';
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
 * Every read degrades gracefully: the services are deployed independently, so a
 * fetch that fails, 401s, or returns a shape that doesn't parse yields `null`
 * and the UI keeps whatever it had (skeletons / empty states — never a crash).
 */
export type ApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getParsed<T>(
  apiFetch: ApiFetch,
  url: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  try {
    const response = await apiFetch(url);
    if (!response.ok) {
      return null;
    }
    return schema.parse(await response.json());
  } catch {
    return null;
  }
}

export function fetchFlags(apiFetch: ApiFetch): Promise<FeatureFlag[] | null> {
  return getParsed(apiFetch, `${SERVICE_URLS.flags}/flags`, z.array(FeatureFlagSchema));
}

export function fetchSimState(apiFetch: ApiFetch): Promise<SimState | null> {
  return getParsed(apiFetch, `${SERVICE_URLS.simulator}/state`, SimStateSchema);
}

export function fetchMarkets(apiFetch: ApiFetch): Promise<Market[] | null> {
  return getParsed(apiFetch, `${SERVICE_URLS.pricing}/markets`, z.array(MarketSchema));
}

export function fetchOutright(apiFetch: ApiFetch): Promise<Market | null> {
  return getParsed(apiFetch, `${SERVICE_URLS.pricing}/outright`, MarketSchema);
}

/**
 * Resolve one market by id. Market ids are derivable (integration.md §3): a
 * MATCH_WINNER market's id equals its fixtureId and the outright's id is the
 * literal 'outright', so no full-list scan is ever needed.
 */
export function fetchMarket(apiFetch: ApiFetch, marketId: string): Promise<Market | null> {
  if (marketId === 'outright') {
    return fetchOutright(apiFetch);
  }
  return getParsed(
    apiFetch,
    `${SERVICE_URLS.pricing}/markets/${encodeURIComponent(marketId)}`,
    MarketSchema
  );
}

export function fetchBets(apiFetch: ApiFetch, accountId: string): Promise<Bet[] | null> {
  return getParsed(
    apiFetch,
    `${SERVICE_URLS.betting}/bets?accountId=${encodeURIComponent(accountId)}`,
    z.array(BetSchema)
  );
}

export type PlaceBetResult =
  | { kind: 'placed'; bet: Bet }
  | { kind: 'price-moved' }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable' };

/** Nest error bodies carry `message` as a string or an array of strings. */
const ErrorBodySchema = z.object({
  message: z.union([z.string(), z.array(z.string())]).optional(),
});

async function rejectionMessage(response: Response): Promise<string> {
  const fallback = `The bet was rejected (${response.status}).`;
  try {
    const body = ErrorBodySchema.parse(await response.json());
    if (Array.isArray(body.message)) {
      return body.message.join(' ');
    }
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Place a bet. The account is derived from the Bearer token server-side —
 * the body never carries an accountId. A 409 means the price moved beyond
 * betting's tolerance: surface it so the punter can accept the new price
 * (resubmitted with a fresh idempotency key) or walk away.
 */
export async function placeBet(
  apiFetch: ApiFetch,
  request: PlaceBetRequest
): Promise<PlaceBetResult> {
  try {
    const response = await apiFetch(`${SERVICE_URLS.betting}/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === 409) {
      return { kind: 'price-moved' };
    }
    if (!response.ok) {
      return { kind: 'rejected', message: await rejectionMessage(response) };
    }
    return { kind: 'placed', bet: BetSchema.parse(await response.json()) };
  } catch {
    return { kind: 'unavailable' };
  }
}
