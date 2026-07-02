import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless session tokens as standard HS256 JSON Web Tokens:
 * `base64url(header).base64url(payload).base64url(signature)`.
 *
 * - header:  `{ "alg": "HS256", "typ": "JWT" }`
 * - payload: `{ sub, iat, exp }` — `exp`/`iat` are seconds since epoch (JWT spec)
 * - signature: HMAC-SHA256 over `base64url(header).base64url(payload)`
 *
 * The signature covers header + payload, so any tampering (including a forged
 * expiry) invalidates the token. Dependency-free so it can be exhaustively
 * unit-tested and reused by the JWT guard — and any standard JWT library can
 * verify it. Shared across services via `@arena/service-auth`, all keyed on the
 * same `SESSION_SECRET`.
 */

const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

interface TokenPayload {
  /** subject: the account id */
  sub: string;
  /** issued-at, seconds since epoch */
  iat: number;
  /** expiry, seconds since epoch */
  exp: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Read lazily (not at import time) so tests and deploys can set the secret
 * before the first token is signed. Falls back to a well-known dev value.
 */
function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'dev-session-secret';
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Sign the `base64url(header).base64url(payload)` signing input. */
function sign(signingInput: string): string {
  return createHmac('sha256', sessionSecret()).update(signingInput).digest('base64url');
}

export function signToken(accountId: string): string {
  const issuedAt = nowSeconds();
  const payload: TokenPayload = {
    sub: accountId,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  };
  const signingInput = `${encodeSegment(JWT_HEADER)}.${encodeSegment(payload)}`;
  return `${signingInput}.${sign(signingInput)}`;
}

/**
 * Returns the `sub` (account id) when the signature is valid AND the token is
 * unexpired, otherwise null. Never throws — malformed input is just an invalid
 * token.
 */
export function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const [encodedHeader, encodedPayload, providedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !providedSignature) {
      return null;
    }

    const expected = Buffer.from(sign(`${encodedHeader}.${encodedPayload}`));
    const provided = Buffer.from(providedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (header.alg !== JWT_HEADER.alg || header.typ !== JWT_HEADER.typ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (nowSeconds() >= payload.exp) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
