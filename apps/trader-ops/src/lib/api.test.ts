import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  errorMessage,
  fetchParsed,
  friendlyStatus,
  MALFORMED_MESSAGE,
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

  it('rejects with a clear admin-key message on 403', async () => {
    const api: ApiFetch = async () => jsonRes({}, 403);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toContain('Admin key rejected (403)');
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
    const api: ApiFetch = async () =>
      jsonRes({ message: 'x-admin-key header required to modify flags' }, 401);
    const err = await fetchParsed(api, 'http://localhost', echo).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe(
      'Not authorised (401) — the session token was rejected. Sign in again. x-admin-key header required to modify flags'
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
  it('sends JSON with Content-Type and the admin key header', async () => {
    const api = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes({ ok: true }));
    await sendParsed(
      api,
      'http://localhost/flags/k',
      { method: 'PUT', body: { enabled: true }, adminKey: 'sesame' },
      echo
    );
    const [url, init] = api.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost/flags/k');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"enabled":true}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-admin-key': 'sesame' });
  });

  it('omits Content-Type and body when there is no body', async () => {
    const api = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes({ ok: true }));
    await sendParsed(api, 'http://localhost/play-next', { method: 'POST', adminKey: 'k' }, echo);
    const [, init] = api.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'x-admin-key': 'k' });
  });

  it('omits the admin key header when none is given', async () => {
    const api = vi.fn(async (_url: string, _init?: RequestInit) => jsonRes({ ok: true }));
    await sendParsed(api, 'http://localhost', { method: 'POST', body: {} }, echo);
    const [, init] = api.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
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
});
