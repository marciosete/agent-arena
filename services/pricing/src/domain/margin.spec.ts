import { TARGET_OVERROUND } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { MAX_PRICE, MIN_PRICE, priceFromProbability } from './margin';

describe('priceFromProbability', () => {
  it('applies the margin proportionally: a two-way book sums to TARGET_OVERROUND', () => {
    for (const probability of [0.5, 0.6, 0.75, 0.8823]) {
      const overround =
        1 / priceFromProbability(probability) + 1 / priceFromProbability(1 - probability);
      expect(overround).toBeCloseTo(TARGET_OVERROUND, 2);
    }
  });

  it('rounds to two decimal places', () => {
    // 1 / (0.5 × 1.05) = 1.9047… → 1.90
    expect(priceFromProbability(0.5)).toBe(1.9);
  });

  it('never prices below the 1.01 floor, even for near-certainties', () => {
    expect(priceFromProbability(1)).toBe(MIN_PRICE);
    expect(priceFromProbability(0.97)).toBe(MIN_PRICE);
  });

  it('caps zero and vanishing probabilities at the maximum price', () => {
    expect(priceFromProbability(0)).toBe(MAX_PRICE);
    expect(priceFromProbability(1e-6)).toBe(MAX_PRICE);
  });

  it('prices France v Paraguay like the demo expects', () => {
    expect(priceFromProbability(0.8823)).toBeCloseTo(1.08, 2);
    expect(priceFromProbability(1 - 0.8823)).toBeCloseTo(8.09, 2);
  });
});
