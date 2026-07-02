import { describe, expect, it } from 'vitest';
import { steady } from '../strategies/steady';
import { bet, matchMarket } from './fixtures';

const board = () => [
  matchMarket('m1', { name: 'France', price: 1.8 }, { name: 'Paraguay', price: 2.2 }),
  matchMarket('m2', { name: 'Canada', price: 1.25 }, { name: 'Norway', price: 4.5 }),
];

describe('steady', () => {
  it('backs the shortest price with a flat 5% of the current bankroll', () => {
    const bets = steady(board(), 8_000, []);
    expect(bets).toHaveLength(1);
    expect(bets[0].selectionName).toBe('Canada');
    expect(bets[0].price).toBe(1.25);
    expect(bets[0].stake).toBe(400); // 5% of 8,000
  });

  it('sizes off the CURRENT bankroll, not the opening one', () => {
    expect(steady(board(), 3_000, [])[0].stake).toBe(150);
  });

  it('ignores suspended markets even when they hold the shortest price', () => {
    const markets = [
      ...board(),
      matchMarket(
        'm3',
        { name: 'Brazil', price: 1.05 },
        { name: 'England', price: 9.0 },
        { status: 'suspended' }
      ),
    ];
    expect(steady(markets, 8_000, [])[0].selectionName).toBe('Canada');
  });

  it('skips markets she already has a pending bet on', () => {
    const bets = steady(board(), 8_000, [bet({ marketId: 'm2' })]);
    expect(bets[0].selectionName).toBe('France'); // next shortest board price
  });

  it('sits out an empty board or a dust bankroll', () => {
    expect(steady([], 8_000, [])).toEqual([]);
    expect(steady(board(), 10, [])).toEqual([]); // 5% of $10 is under the $1 minimum
  });
});
