/**
 * Client-side JWT inspection — NO signature verification (that stays server-side).
 * We only ever peek at the `exp` claim so we can drop a session whose token has
 * already expired instead of firing doomed authenticated requests.
 */

interface JwtPayload {
  exp?: unknown;
}

/** base64url-decode a JWT segment into its UTF-8 string, or throw on malformed input. */
function decodeSegment(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

/**
 * Read the `exp` (seconds since the Unix epoch) from a JWT without verifying it.
 * Returns `null` when the token is malformed or carries no numeric `exp`.
 */
export function jwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeSegment(parts[1])) as JwtPayload;
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * A token is usable only when it carries a numeric `exp` that is still in the
 * future. Malformed or exp-less tokens are treated as invalid so we never trust
 * a session we cannot reason about.
 */
export function isTokenValid(token: string, nowMs: number = Date.now()): boolean {
  const exp = jwtExp(token);
  return exp !== null && exp * 1000 > nowMs;
}
