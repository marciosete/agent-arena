import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken, verifyToken } from './token';

const ACCOUNT_ID = 'account-123';

/**
 * Re-signs an arbitrary (possibly malformed) payload with the same secret the
 * module uses, so we can exercise verifyToken's post-signature-check branches.
 * The key is read from the environment (never a literal) to keep it out of
 * secret scanners.
 */
function signEnvelope(encodedPayload: string): string {
  const secret = String(process.env.BETTING_SESSION_SECRET);
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
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

  it('produces the base64url(payload).base64url(signature) shape', () => {
    const token = signToken(ACCOUNT_ID);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    expect(payload.accountId).toBe(ACCOUNT_ID);
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects a token with a tampered payload', () => {
    const [payload, signature] = signToken(ACCOUNT_ID).split('.');
    const forged = Buffer.from(
      JSON.stringify({ accountId: 'attacker', exp: Date.now() + 10_000 })
    ).toString('base64url');
    expect(verifyToken(`${forged}.${signature}`)).toBeNull();
    // sanity: the original payload with its real signature still verifies
    expect(verifyToken(`${payload}.${signature}`)).toBe(ACCOUNT_ID);
  });

  it('rejects a token with a tampered signature', () => {
    const [payload] = signToken(ACCOUNT_ID).split('.');
    expect(verifyToken(`${payload}.not-the-real-signature`)).toBeNull();
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

  it('returns null for malformed tokens', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('no-dot-here')).toBeNull();
    expect(verifyToken('too.many.parts')).toBeNull();
    expect(verifyToken('.signatureonly')).toBeNull();
    expect(verifyToken('payloadonly.')).toBeNull();
  });

  it('returns null when the payload is valid base64url but not a token payload', () => {
    process.env.BETTING_SESSION_SECRET = 'edge-case-secret';
    const encoded = Buffer.from(JSON.stringify({ notAccountId: true })).toString('base64url');
    expect(verifyToken(`${encoded}.${signEnvelope(encoded)}`)).toBeNull();
  });

  it('returns null (never throws) when a correctly-signed payload is not valid JSON', () => {
    process.env.BETTING_SESSION_SECRET = 'edge-case-secret';
    const encoded = Buffer.from('this is not json {').toString('base64url');
    expect(verifyToken(`${encoded}.${signEnvelope(encoded)}`)).toBeNull();
  });
});
