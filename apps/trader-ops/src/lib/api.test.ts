import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchJson, jsonInit, type ApiFetch } from './api';

const PayloadSchema = z.object({ value: z.number() });

function respondWith(body: unknown, status = 200): ApiFetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

describe('fetchJson', () => {
  it('parses a valid payload through the schema', async () => {
    const result = await fetchJson(respondWith({ value: 7 }), 'https://svc/x', PayloadSchema);
    expect(result).toEqual({ ok: true, data: { value: 7 } });
  });

  it('reports HTTP failures with their status', async () => {
    const result = await fetchJson(respondWith({}, 503), 'https://svc/x', PayloadSchema);
    expect(result).toEqual({ ok: false, status: 503, message: 'HTTP 503' });
  });

  it('reports a thrown fetch as service unreachable', async () => {
    const dead: ApiFetch = async () => {
      throw new TypeError('network down');
    };
    const result = await fetchJson(dead, 'https://svc/x', PayloadSchema);
    expect(result).toEqual({ ok: false, status: null, message: 'service unreachable' });
  });

  it('rejects payloads that fail the contract schema', async () => {
    const result = await fetchJson(respondWith({ value: 'nope' }), 'https://svc/x', PayloadSchema);
    expect(result).toEqual({
      ok: false,
      status: 200,
      message: 'response failed contract validation',
    });
  });
});

describe('jsonInit', () => {
  it('builds a JSON request and merges extra headers', () => {
    const init = jsonInit('PUT', { enabled: true }, { 'x-admin-key': 'k1' });
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-admin-key': 'k1' });
    expect(init.body).toBe('{"enabled":true}');
  });

  it('omits the body when none is given', () => {
    const init = jsonInit('POST');
    expect(init.method).toBe('POST');
    expect('body' in init).toBe(false);
  });
});
