/**
 * Thin HTTP layer: every call returns a result, never throws. Services may
 * not exist yet while the fleet builds in parallel — connection refused, 4xx
 * and 5xx are all normal outcomes the bots skip past.
 */

/**
 * Anything with a zod-style safeParse. Structural on purpose: the contract
 * schemas ship with @arena/contracts' own zod copy, so naming zod's types
 * here would weld us to one zod major version.
 */
export interface SchemaLike<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<{
            path: ReadonlyArray<string | number | symbol>;
            message: string;
          }>;
        };
      };
}

export interface ApiFailure {
  ok: false;
  kind: 'network' | 'http' | 'parse';
  /** HTTP status when kind === 'http' */
  status?: number;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export const HTTP_UNAUTHORIZED = 401;
export const HTTP_CONFLICT = 409;

/** A wedged upstream must never stall the show loop — abort and move on. */
export const REQUEST_TIMEOUT_MS = 5_000;

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // undici says only "fetch failed" — the useful part (ECONNREFUSED, DNS…) is the cause
  const cause = error.cause instanceof Error ? error.cause.message : error.cause;
  return cause ? `${error.message} (${String(cause)})` : error.message;
}

export async function requestJson<T>(
  schema: SchemaLike<T>,
  url: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const label = `${init.method ?? 'GET'} ${url}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init });
  } catch (error) {
    return { ok: false, kind: 'network', message: `${label} unreachable: ${describe(error)}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      kind: 'http',
      status: response.status,
      message: `${label} → ${response.status} ${body.slice(0, 200)}`.trimEnd(),
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return { ok: false, kind: 'parse', message: `${label} returned non-JSON: ${describe(error)}` };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { ok: false, kind: 'parse', message: `${label} broke the contract: ${issues}` };
  }
  return { ok: true, data: parsed.data };
}
