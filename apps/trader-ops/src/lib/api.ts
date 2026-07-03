/**
 * Typed fetch layer: every response is parsed against its contract zod schema
 * before it reaches a component ("parse, don't trust"). Callers hand in the
 * session-bound `apiFetch` from `@arena/web-auth`, which attaches the Bearer JWT.
 */

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** Structural stand-in for a zod schema — keeps this module zod-instance agnostic. */
export interface Parser<T> {
  parse(input: unknown): T;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const FRIENDLY_STATUS: Record<number, string> = {
  400: 'The service rejected the request as invalid (400).',
  401: 'Not authorised (401) — the session token was rejected. Sign in again.',
  403: 'Admin key rejected (403) — x-admin-key is missing or wrong.',
};

export function friendlyStatus(status: number): string {
  return FRIENDLY_STATUS[status] ?? `Request failed (${status}).`;
}

export const UNREACHABLE_MESSAGE = 'Service unreachable — retrying…';

export const MALFORMED_MESSAGE =
  'Unexpected response — the service reply does not match the contract.';

/** Pull the NestJS-style `message` out of an error body, if there is one. */
function bodyDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('message' in body)) {
    return null;
  }
  const detail = (body as { message: unknown }).message;
  if (typeof detail === 'string' && detail) {
    return detail;
  }
  return Array.isArray(detail) && detail.length > 0 ? detail.join('; ') : null;
}

async function failureMessage(res: Response): Promise<string> {
  const base = friendlyStatus(res.status);
  let detail: string | null = null;
  try {
    detail = bodyDetail(await res.json());
  } catch {
    /* non-JSON error body — the status text alone will have to do */
  }
  return detail ? `${base} ${detail}` : base;
}

async function run(api: ApiFetch, url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await api(url, init);
  } catch {
    throw new ApiError(0, UNREACHABLE_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(res.status, await failureMessage(res));
  }
  return res;
}

/** Parse a 2xx body against the contract; a drifted or non-JSON reply is still an ApiError. */
async function parseBody<T>(res: Response, parser: Parser<T>): Promise<T> {
  try {
    return parser.parse(await res.json());
  } catch {
    throw new ApiError(res.status, MALFORMED_MESSAGE);
  }
}

/** GET `url` and parse the JSON body against `parser`. */
export async function fetchParsed<T>(api: ApiFetch, url: string, parser: Parser<T>): Promise<T> {
  const res = await run(api, url);
  return parseBody(res, parser);
}

export interface SendOptions {
  method: 'POST' | 'PUT';
  body?: unknown;
  /** extra control-plane gate on top of the JWT (flags flip, simulator controls) */
  adminKey?: string;
}

/** Send a mutation and parse the JSON response against `parser`. */
export async function sendParsed<T>(
  api: ApiFetch,
  url: string,
  options: SendOptions,
  parser: Parser<T>
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.adminKey) {
    headers['x-admin-key'] = options.adminKey;
  }
  const res = await run(api, url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return parseBody(res, parser);
}

/** Human-readable message for anything a fetch can throw. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}
