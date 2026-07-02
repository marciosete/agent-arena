import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken, verifyToken } from './token';

const ACCOUNT_ID = 'account-123';
const TWELVE_HOURS_SECONDS = 12 * 60 * 60;

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Re-signs an arbitrary `header.payload` signing input with the same secret the
 * module uses, so we can exercise verifyToken's post-signature-check branches.
 * The key is read from the environment (never a literal) to keep it out of
 * secret scanners.
 */
function signEnvelope(signingInput: string): string {
  const secret = String(process.env.BETTING_SESSION_SECRET);
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

describe('token', () => {
  afterEach(() => {
    delete process.env.BETTING_SESSION_SECRET;
    vi.useRealTimers();
  });

  it('round-trips: a freshly signed token verifies back to the account id', () => {
    const token = signToken(ACCOUNT_ID);
    expect(verifyToken(token)).toBe(ACCOUNT_ID);
  });

  it('produces a standard HS256 JWT: header.payload.signature with second-precision claims', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T00:00:00.000Z'));
    const nowSeconds = Math.floor(Date.now() / 1000);

    const token = signToken(ACCOUNT_ID);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    const header = decodeSegment(parts[0]);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });

    const payload = decodeSegment(parts[1]);
    expect(payload.sub).toBe(ACCOUNT_ID);
    expect(payload.iat).toBe(nowSeconds);
    expect(payload.exp).toBe(nowSeconds + TWELVE_HOURS_SECONDS);
  });

  it('is verifiable by any standard HS256 JWT tool (signature = HMAC over header.payload)', () => {
    process.env.BETTING_SESSION_SECRET = 'interop-secret';
    const [header, payload, signature] = signToken(ACCOUNT_ID).split('.');
    // Reproduce exactly what a conformant verifier computes over the signing input.
    expect(signEnvelope(`${header}.${payload}`)).toBe(signature);
  });

  it('rejects a token with a tampered header', () => {
    const [, payload, signature] = signToken(ACCOUNT_ID).split('.');
    const forgedHeader = encodeSegment({ alg: 'none', typ: 'JWT' });
    expect(verifyToken(`${forgedHeader}.${payload}.${signature}`)).toBeNull();
  });

  it('rejects a token with a tampered payload', () => {
    const [header, payload, signature] = signToken(ACCOUNT_ID).split('.');
    const forged = encodeSegment({
      sub: 'attacker',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10_000,
    });
    expect(verifyToken(`${header}.${forged}.${signature}`)).toBeNull();
    // sanity: the original payload with its real signature still verifies
    expect(verifyToken(`${header}.${payload}.${signature}`)).toBe(ACCOUNT_ID);
  });

  it('rejects a token with a tampered signature', () => {
    const [header, payload] = signToken(ACCOUNT_ID).split('.');
    expect(verifyToken(`${header}.${payload}.not-the-real-signature`)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T00:00:00.000Z'));
    const token = signToken(ACCOUNT_ID);
    // advance beyond the 12h TTL
    vi.setSystemTime(new Date('2026-07-02T13:00:00.000Z'));
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects a token signed under a different secret', () => {
    process.env.BETTING_SESSION_SECRET = 'secret-a';
    const token = signToken(ACCOUNT_ID);
    process.env.BETTING_SESSION_SECRET = 'secret-b';
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects a correctly-signed token whose header is not HS256/JWT', () => {
    process.env.BETTING_SESSION_SECRET = 'edge-case-secret';
    const header = encodeSegment({ alg: 'none', typ: 'JWT' });
    const payload = encodeSegment({
      sub: ACCOUNT_ID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10_000,
    });
    const signingInput = `${header}.${payload}`;
    expect(verifyToken(`${signingInput}.${signEnvelope(signingInput)}`)).toBeNull();
  });

  it('returns null for malformed tokens', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('no-dot-here')).toBeNull();
    expect(verifyToken('only.two')).toBeNull();
    expect(verifyToken('way.too.many.parts')).toBeNull();
    expect(verifyToken('.payload.signature')).toBeNull();
    expect(verifyToken('header..signature')).toBeNull();
    expect(verifyToken('header.payload.')).toBeNull();
  });

  it('returns null when the payload is valid base64url but not a token payload', () => {
    process.env.BETTING_SESSION_SECRET = 'edge-case-secret';
    const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const payload = encodeSegment({ notSub: true });
    const signingInput = `${header}.${payload}`;
    expect(verifyToken(`${signingInput}.${signEnvelope(signingInput)}`)).toBeNull();
  });

  it('returns null (never throws) when a correctly-signed payload is not valid JSON', () => {
    process.env.BETTING_SESSION_SECRET = 'edge-case-secret';
    const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
    const payload = Buffer.from('this is not json {').toString('base64url');
    const signingInput = `${header}.${payload}`;
    expect(verifyToken(`${signingInput}.${signEnvelope(signingInput)}`)).toBeNull();
  });
});
