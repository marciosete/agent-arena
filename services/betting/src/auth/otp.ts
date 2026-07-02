import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * One-time-code primitives. Codes are compared by their SHA-256 hashes in
 * constant time so a timing side-channel can't leak how many leading digits
 * were correct. Pure + unit-tested.
 */

/** A uniformly-random 6-digit code, zero-padded (e.g. "007321"). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** SHA-256 hex digest — what we persist instead of the raw code. */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Constant-time comparison of `hashCode(code)` against a stored hash. */
export function codesMatch(code: string, hash: string): boolean {
  const provided = Buffer.from(hashCode(code));
  const expected = Buffer.from(hash);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
