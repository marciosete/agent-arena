import { describe, expect, it } from 'vitest';
import { CHASER_BASE_STAKE, chaser, lossStreak } from '../strategies/chaser';
import { bet, matchMarket } from './fixtures';

const board = () => [
  matchMarket('m1', { name: 'France', price: 1.2 }, { name: 'Paraguay', price: 8.0 }),
  matchMarket('m2', { name: 'Canada', price: 2.05 }, { name: 'Norway', price: 1.9 }),
];

const lost = (marketId: string, settledAt: string) => bet({ marketId, status: 'lost', settledAt });
const won = (marketId: string, settledAt: string) => bet({ marketId, status: 'won', settledAt });

describe('chaser', () => {
  it('opens with the base stake on the price nearest evens', () => {
    const bets = chaser(board(), 10_000, []);
    expect(bets).toHaveLength(1);
    expect(bets[0].selectionName).toBe('Canada'); // 2.05 is closer to evens than 1.9
    expect(bets[0].stake).toBe(CHASER_BASE_STAKE);
  });

  it('doubles the stake after each consecutive loss and resets after a win', () => {
    const twoLosses = [
      lost('x1', '2026-07-03T10:00:00.000Z'),
      lost('x2', '2026-07-03T11:00:00.000Z'),
    ];
    expect(chaser(board(), 10_000, twoLosses)[0].stake).toBe(CHASER_BASE_STAKE * 4);

    const winLatest = [...twoLosses, won('x3', '2026-07-03T12:00:00.000Z')];
    expect(chaser(board(), 10_000, winLatest)[0].stake).toBe(CHASER_BASE_STAKE);
  });

  it('orders settlements by time, not by array position', () => {
    // A win exists but it is OLDER than both losses — streak is still 2.
    const shuffled = [
      lost('x3', '2026-07-03T12:00:00.000Z'),
      won('x1', '2026-07-03T10:00:00.000Z'),
      lost('x2', '2026-07-03T11:00:00.000Z'),
    ];
    expect(lossStreak(shuffled)).toBe(2);
    expect(chaser(board(), 10_000, shuffled)[0].stake).toBe(CHASER_BASE_STAKE * 4);
  });

  it('resets when a win lands in the same settlement batch as a loss', () => {
    // One POST /settle stamps every affected bet with the same settledAt.
    const t = '2026-07-03T12:00:00.000Z';
    expect(lossStreak([lost('x1', t), won('x2', t)])).toBe(0);
    expect(lossStreak([won('x2', t), lost('x1', t)])).toBe(0); // order-independent
  });

  it('goes all-in when the double outgrows the bankroll', () => {
    const threeLosses = [
      lost('x1', '2026-07-03T10:00:00.000Z'),
      lost('x2', '2026-07-03T11:00:00.000Z'),
      lost('x3', '2026-07-03T12:00:00.000Z'),
    ];
    // Target is $800; only $500 left — he lumps the lot.
    expect(chaser(board(), 500, threeLosses)[0].stake).toBe(500);
  });

  it('ignores pending bets when counting the streak', () => {
    const history = [
      lost('x1', '2026-07-03T10:00:00.000Z'),
      bet({ marketId: 'x9', status: 'pending' }),
    ];
    expect(lossStreak(history)).toBe(1);
  });

  it('sits out when broke or when nothing is biddable', () => {
    expect(chaser(board(), 0.4, [])).toEqual([]);
    expect(chaser([], 10_000, [])).toEqual([]);
    const allPending = [bet({ marketId: 'm1' }), bet({ marketId: 'm2' })];
    expect(chaser(board(), 10_000, allPending)).toEqual([]);
  });
});
