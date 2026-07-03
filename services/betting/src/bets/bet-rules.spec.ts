import { describe, expect, it } from 'vitest';
import { PRICE_TOLERANCE, computePotentialReturn, isPriceWithinTolerance } from './bet-rules';

describe('bet-rules', () => {
  describe('PRICE_TOLERANCE', () => {
    it('is betting-local 5% — never a shared contract value', () => {
      expect(PRICE_TOLERANCE).toBe(0.05);
    });
  });

  describe('computePotentialReturn', () => {
    it('multiplies stake by decimal odds (stake included in the return)', () => {
      expect(computePotentialReturn(100, 2.5)).toBe(250);
    });

    it('rounds the return to cents', () => {
      expect(computePotentialReturn(33.33, 3.03)).toBe(100.99);
    });

    it('handles float-noisy products', () => {
      expect(computePotentialReturn(10, 1.1)).toBe(11);
    });
  });

  describe('isPriceWithinTolerance', () => {
    it('accepts the unchanged price', () => {
      expect(isPriceWithinTolerance(2.0, 2.0)).toBe(true);
    });

    it('accepts drift up to 5% of the accepted price in both directions', () => {
      expect(isPriceWithinTolerance(2.0, 2.09)).toBe(true);
      expect(isPriceWithinTolerance(2.0, 1.91)).toBe(true);
    });

    it('accepts the exact 5% boundary (inclusive, float-safe)', () => {
      expect(isPriceWithinTolerance(2.0, 2.1)).toBe(true);
      expect(isPriceWithinTolerance(2.0, 1.9)).toBe(true);
    });

    it('rejects a price that moved beyond 5% either way', () => {
      expect(isPriceWithinTolerance(2.0, 2.11)).toBe(false);
      expect(isPriceWithinTolerance(2.0, 1.89)).toBe(false);
    });

    it('scales the tolerance with the accepted price, not a flat amount', () => {
      // 5% of 10.0 is 0.5 — a 0.4 move is fine at long odds…
      expect(isPriceWithinTolerance(10.0, 10.4)).toBe(true);
      // …but the same 0.4 move at short odds is way outside 5% of 1.5.
      expect(isPriceWithinTolerance(1.5, 1.9)).toBe(false);
    });
  });
});
