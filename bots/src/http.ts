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

export const HTTP_CONFLICT = 409;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function requestJson<T>(
  schema: SchemaLike<T>,
  url: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const label = `${init.method ?? 'GET'} ${url}`;
  let response: Response;
  try {
    response = await fetch(url, init);
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
