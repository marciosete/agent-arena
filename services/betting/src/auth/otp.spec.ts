import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { codesMatch, generateCode, hashCode } from './otp';

describe('otp', () => {
  describe('generateCode', () => {
    it('always returns a zero-padded 6-digit numeric string', () => {
      for (let i = 0; i < 500; i += 1) {
        expect(generateCode()).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('hashCode', () => {
    it('returns the sha256 hex digest of the code', () => {
      const expected = createHash('sha256').update('123456').digest('hex');
      expect(hashCode('123456')).toBe(expected);
      expect(hashCode('123456')).toHaveLength(64);
    });

    it('is deterministic and differs across inputs', () => {
      expect(hashCode('000000')).toBe(hashCode('000000'));
      expect(hashCode('000000')).not.toBe(hashCode('000001'));
    });
  });

  describe('codesMatch', () => {
    it('returns true when the code hashes to the stored hash', () => {
      expect(codesMatch('123456', hashCode('123456'))).toBe(true);
    });

    it('returns false when the code does not match', () => {
      expect(codesMatch('000000', hashCode('123456'))).toBe(false);
    });

    it('returns false (without throwing) when the stored hash has a different length', () => {
      expect(codesMatch('123456', 'short-hash')).toBe(false);
    });
  });
});
