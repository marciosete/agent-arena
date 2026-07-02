import { TARGET_OVERROUND } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { MAX_PRICE, MIN_PRICE, priceFromProbability } from './margin';

describe('priceFromProbability', () => {
  it('prices a two-way book to the 1.05 overround target', () => {
    const pHome = 0.8823;
    const impliedSum = 1 / priceFromProbability(pHome) + 1 / priceFromProbability(1 - pHome);
    expect(impliedSum).toBeCloseTo(TARGET_OVERROUND, 2);
  });

  it('applies the margin proportionally, preserving relative probabilities', () => {
    const strong = 0.8;
    const weak = 0.2;
    const impliedRatio = 1 / priceFromProbability(strong) / (1 / priceFromProbability(weak));
    expect(impliedRatio).toBeCloseTo(strong / weak, 1);
  });

  it('quotes an even coin flip at 1.90 under the 5% margin', () => {
    expect(priceFromProbability(0.5)).toBeCloseTo(1.9, 2);
  });

  it('honours a custom overround (fair book at 1.0)', () => {
    expect(priceFromProbability(0.5, 1)).toBe(2);
  });

  it('never quotes below the schema floor of 1.01', () => {
    expect(priceFromProbability(1)).toBe(MIN_PRICE);
  });

  it('caps zero-probability longshots at a finite maximum', () => {
    expect(priceFromProbability(0)).toBe(MAX_PRICE);
  });

  it('quotes to two decimal places', () => {
    const price = priceFromProbability(0.3141592);
    expect(price).toBe(Math.round(price * 100) / 100);
  });
});
