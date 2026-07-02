import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless session tokens: `base64url(payloadJson).base64url(hmacSha256)`.
 * The signature covers the encoded payload, so any tampering (including a
 * forged expiry) invalidates the token. Pure + dependency-free so it can be
 * exhaustively unit-tested and reused by the Bearer guard.
 */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface TokenPayload {
  accountId: string;
  /** absolute expiry, ms since epoch */
  exp: number;
}

/**
 * Read lazily (not at import time) so tests and deploys can set the secret
 * before the first token is signed. Falls back to a well-known dev value.
 */
function sessionSecret(): string {
  return process.env.BETTING_SESSION_SECRET ?? 'dev-session-secret';
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', sessionSecret()).update(encodedPayload).digest('base64url');
}

export function signToken(accountId: string): string {
  const payload: TokenPayload = { accountId, exp: Date.now() + TOKEN_TTL_MS };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/**
 * Returns the accountId when the signature is valid AND the token is unexpired,
 * otherwise null. Never throws — malformed input is just an invalid token.
 */
export function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature) {
      return null;
    }

    const expected = Buffer.from(sign(encodedPayload));
    const provided = Buffer.from(providedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (typeof payload.accountId !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() >= payload.exp) {
      return null;
    }
    return payload.accountId;
  } catch {
    return null;
  }
}
