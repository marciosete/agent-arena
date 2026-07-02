import { describe, expect, it } from 'vitest';
import { LONGSHOT_PRICE, MUG_STAKE, mug } from '../strategies/mug';
import { bet, matchMarket } from './fixtures';

const board = () => [
  matchMarket('m1', { name: 'France', price: 1.5 }, { name: 'Paraguay', price: 3.5 }),
  matchMarket('m2', { name: 'Canada', price: 2.9 }, { name: 'Norway', price: 4.0 }),
];

describe('mug', () => {
  it('backs only longshots priced over 3.0 with a flat $200', () => {
    const bets = mug(board(), 10_000, [], () => 0);
    expect(bets).toHaveLength(1);
    expect(bets[0].price).toBeGreaterThan(LONGSHOT_PRICE);
    expect(bets[0].stake).toBe(MUG_STAKE);
    expect(bets[0].selectionName).toBe('Paraguay'); // rng 0 → first longshot
  });

  it('lets the rng pick among the available longshots', () => {
    const bets = mug(board(), 10_000, [], () => 0.75);
    expect(bets[0].selectionName).toBe('Norway'); // floor(0.75 × 2) → second
  });

  it('treats exactly 3.0 as too short — not a longshot', () => {
    const short = [
      matchMarket('m1', { name: 'France', price: 1.4 }, { name: 'Paraguay', price: 3.0 }),
    ];
    expect(mug(short, 10_000, [], () => 0)).toEqual([]);
  });

  it('sits out when the bankroll cannot cover the flat stake', () => {
    expect(mug(board(), MUG_STAKE - 1, [], () => 0)).toEqual([]);
  });

  it('skips markets he already has a pending bet on', () => {
    const history = [bet({ marketId: 'm1' }), bet({ marketId: 'm2' })];
    expect(mug(board(), 10_000, history, () => 0)).toEqual([]);
  });
});
