import { describe, expect, it } from 'vitest';
import { isTokenValid, jwtExp } from './jwt';

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function tokenWithPayload(payload: unknown): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

const NOW = 1_700_000_000_000;

describe('jwtExp', () => {
  it('reads a numeric exp claim', () => {
    expect(jwtExp(tokenWithPayload({ exp: 42 }))).toBe(42);
  });

  it('returns null for a token without three segments', () => {
    expect(jwtExp('only.two')).toBeNull();
  });

  it('returns null when exp is absent', () => {
    expect(jwtExp(tokenWithPayload({ sub: 'u' }))).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    expect(jwtExp(tokenWithPayload({ exp: 'soon' }))).toBeNull();
  });

  it('returns null for an unparseable payload', () => {
    expect(jwtExp('aaa.!!!not-base64-json!!!.bbb')).toBeNull();
  });
});

describe('isTokenValid', () => {
  it('accepts a token whose exp is still in the future', () => {
    const token = tokenWithPayload({ exp: Math.floor(NOW / 1000) + 3600 });
    expect(isTokenValid(token, NOW)).toBe(true);
  });

  it('rejects a token whose exp has passed', () => {
    const token = tokenWithPayload({ exp: Math.floor(NOW / 1000) - 1 });
    expect(isTokenValid(token, NOW)).toBe(false);
  });

  it('rejects a malformed or exp-less token', () => {
    expect(isTokenValid('garbage', NOW)).toBe(false);
    expect(isTokenValid(tokenWithPayload({ sub: 'u' }), NOW)).toBe(false);
  });
});
