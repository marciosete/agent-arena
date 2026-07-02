import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestJson } from '../http';

const schema = z.object({ ok: z.boolean() });
const URL = 'http://svc.test/thing';

function failure(result: Awaited<ReturnType<typeof requestJson>>) {
  if (result.ok) throw new Error('expected a failure result');
  return result;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('degrades gracefully when the service is down (connection refused)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED')));
    const result = failure(await requestJson(schema, URL));
    expect(result.kind).toBe('network');
    expect(result.message).toContain('unreachable');
  });

  it('degrades gracefully on a 4xx without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 403 })));
    const result = failure(await requestJson(schema, URL));
    expect(result.kind).toBe('http');
    expect(result.status).toBe(403);
    expect(result.message).toContain('bad key');
  });

  it('degrades gracefully on a 5xx without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const result = failure(await requestJson(schema, URL));
    expect(result.kind).toBe('http');
    expect(result.status).toBe(500);
  });

  it('rejects a non-JSON body as a parse failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 }))
    );
    const result = failure(await requestJson(schema, URL));
    expect(result.kind).toBe('parse');
  });

  it('rejects a body that breaks the contract schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: 'yes' })));
    const result = failure(await requestJson(schema, URL));
    expect(result.kind).toBe('parse');
    expect(result.message).toContain('ok');
  });

  it('returns parsed data on success and labels requests by method', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestJson(schema, URL, { method: 'POST' });
    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(URL, { method: 'POST' });
  });
});
