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
  /** subject: the account id (humans) or a service name (service tokens) */
  sub: string;
  /** issued-at, seconds since epoch */
  iat: number;
  /** expiry, seconds since epoch */
  exp: number;
  /**
   * Admin authority, baked in at signing time. True for allowlisted operator
   * logins (betting stamps it from ADMIN_EMAILS) and for backend service tokens.
   * Only the holder of SESSION_SECRET can mint a token, so `admin` is unforgeable.
   * Omitted (falsy) for ordinary punters.
   */
  admin?: boolean;
}

/** What a verified token asserts about its bearer. */
export interface TokenClaims {
  /** account id (humans) or service name (service tokens) */
  sub: string;
  /** true when the bearer may perform admin actions (reset, settle, flags) */
  admin: boolean;
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

/**
 * Sign a session token. Pass `{ admin: true }` for allowlisted operators (set by
 * betting at login) and for backend service tokens; omit it for ordinary punters.
 */
export function signToken(sub: string, opts: { admin?: boolean } = {}): string {
  const issuedAt = nowSeconds();
  const payload: TokenPayload = {
    sub,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
    ...(opts.admin ? { admin: true } : {}),
  };
  const signingInput = `${encodeSegment(JWT_HEADER)}.${encodeSegment(payload)}`;
  return `${signingInput}.${sign(signingInput)}`;
}

/**
 * Returns the token's {@link TokenClaims} when the signature is valid AND the
 * token is unexpired, otherwise null. Never throws — malformed input is just an
 * invalid token.
 */
export function verifyTokenClaims(token: string): TokenClaims | null {
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
    return { sub: payload.sub, admin: payload.admin === true };
  } catch {
    return null;
  }
}

/**
 * Returns the `sub` (account id / service name) when the token is valid, else
 * null. Convenience wrapper over {@link verifyTokenClaims} for callers that only
 * need identity.
 */
export function verifyToken(token: string): string | null {
  return verifyTokenClaims(token)?.sub ?? null;
}

/**
 * Is `email` on the ADMIN_EMAILS allowlist (comma-separated, case-insensitive)?
 * Betting calls this at login to decide whether to stamp `admin: true` into the
 * session token. No allowlist configured ⇒ nobody is an admin.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return allowlist.includes(email.toLowerCase());
}
