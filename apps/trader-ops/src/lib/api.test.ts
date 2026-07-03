import { describe, expect, it, vi } from 'vitest';
import {
  adminActionError,
  ApiError,
  errorMessage,
  fetchParsed,
  friendlyStatus,
  MALFORMED_MESSAGE,
  NOT_ADMIN_MESSAGE,
  sendParsed,
  UNREACHABLE_MESSAGE,
  type ApiFetch,
} from './api';

const echo = { parse: (input: unknown) => input as { ok: boolean } };

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchParsed', () => {
  it('returns the parsed body on success', async () => {
    const api: ApiFetch = vi.fn(async () => jsonRes({ ok: true }));
    await expect(fetchParsed(api, 'http://localhost/thing', echo)).resolves.toEqual({ ok: true });
    expect(api).toHaveBeenCalledWith('http://localhost/thing', undefined);
  });

  it('runs the response through the parser', async () => {
    const api: ApiFetch = async () => jsonRes({ n: 2 });
    const doubler = { parse: (input: unknown) => (input as { n: number }).n * 2 };
    await expect(fetchParsed(api, 'http://localhost', doubler)).resolves.toBe(4);
  });

  it('rejects with a clear not-authorised message on 401', async () => {
    const api: ApiFetch = async () => jsonRes({}, 401);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toContain('Not authorised (401)');
  });

  it('rejects with a clear forbidden message on 403', async () => {
    const api: ApiFetch = async () => jsonRes({}, 403);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toContain('Forbidden (403)');
  });

  it('falls back to a generic message for other statuses', async () => {
    const api: ApiFetch = async () => jsonRes({}, 503);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe('Request failed (503).');
  });

  it('maps a contract-drifted 200 body to a readable ApiError (no raw zod dump)', async () => {
    const strict = {
      parse: (): never => {
        throw new Error('zod: invalid enum value');
      },
    };
    const api: ApiFetch = async () => jsonRes({ drifted: true });
    const err = await fetchParsed(api, 'http://localhost', strict).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(MALFORMED_MESSAGE);
  });

  it('maps a non-JSON 200 body to the same readable ApiError', async () => {
    const api: ApiFetch = async () => new Response('<html>oops</html>', { status: 200 });
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe(MALFORMED_MESSAGE);
  });

  it('appends the server-provided message to HTTP failures', async () => {
    const api: ApiFetch = async () => jsonRes({ message: 'token expired' }, 401);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe(
      'Not authorised (401) — the session token was rejected. Sign in again. token expired'
    );
  });

  it('maps a network failure to status 0 with the unreachable message', async () => {
    const api: ApiFetch = async () => {
      throw new TypeError('fetch failed');
    };
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe(UNREACHABLE_MESSAGE);
  });
});

describe('sendParsed', () => {
  it('sends JSON with a Content-Type header and no x-admin-key (auth rides the Bearer)', async () => {
    const api = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes({ ok: true }));
    await sendParsed(
      api,
      'http://localhost/flags/k',
      { method: 'PUT', body: { enabled: true } },
      echo
    );
    const [url, init] = api.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost/flags/k');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"enabled":true}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect('x-admin-key' in (init.headers as Record<string, string>)).toBe(false);
  });

  it('omits Content-Type and body (and any header) when there is no body', async () => {
    const api = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes({ ok: true }));
    await sendParsed(api, 'http://localhost/play-next', { method: 'POST' }, echo);
    const [, init] = api.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('surfaces HTTP failures as ApiError', async () => {
    const api: ApiFetch = async () => jsonRes({}, 403);
    const err = await sendParsed(api, 'http://localhost', { method: 'PUT', body: {} }, echo).catch(
      (e: unknown) => e
    );
    expect((err as ApiError).status).toBe(403);
  });
});

describe('helpers', () => {
  it('friendlyStatus knows the canonical failure codes', () => {
    expect(friendlyStatus(400)).toContain('invalid (400)');
    expect(friendlyStatus(418)).toBe('Request failed (418).');
  });

  it('errorMessage unwraps Errors and falls back otherwise', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('Request failed.');
  });

  it('adminActionError maps a 403 to the not-an-admin message', () => {
    expect(adminActionError(new ApiError(403, 'Forbidden (403) — nope'))).toBe(NOT_ADMIN_MESSAGE);
  });

  it('adminActionError falls back to the error message for non-403 failures', () => {
    expect(adminActionError(new ApiError(500, 'boom'))).toBe('boom');
    expect(adminActionError('nope')).toBe('Request failed.');
  });
});
