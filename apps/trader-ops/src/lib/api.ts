import { z } from 'zod';
import type { ZodType } from 'zod';
import { AccountSchema, FeatureFlagSchema, MarketSchema } from '@arena/contracts';

/** The `fetch` shape `@arena/web-auth` exposes via `useApi()` — attaches the Bearer JWT. */
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Discriminated fetch result. The services this console reads are built by
 * other teams and may be down or half-finished mid-show — callers render a
 * degraded state off `ok: false`, they never throw.
 */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number | null; message: string };

/** Fetch + zod-parse a JSON endpoint into an {@link ApiResult}. Never throws. */
export async function fetchJson<T>(
  api: ApiFetch,
  url: string,
  schema: ZodType<T>,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await api(url, init);
  } catch {
    return { ok: false, status: null, message: 'service unreachable' };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: `HTTP ${response.status}` };
  }
  try {
    return { ok: true, data: schema.parse(await response.json()) };
  } catch {
    return { ok: false, status: response.status, message: 'response failed contract validation' };
  }
}

/** Build a JSON write request; extra headers (e.g. `x-admin-key`) merge in. */
export function jsonInit(
  method: 'POST' | 'PUT',
  body?: unknown,
  headers: Record<string, string> = {}
): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

// List shapes shared by the panels (the contract exports item schemas only).
export const FlagListSchema = z.array(FeatureFlagSchema);
export const AccountListSchema = z.array(AccountSchema);
export const MarketListSchema = z.array(MarketSchema);
