import { describe, expect, it } from 'vitest';
import { splitSettlement, type SettleableBet } from './settlement.domain';

const WINNING = [
  { marketId: 'r16-1', selectionId: 'sel-bra' },
  { marketId: 'outright', selectionId: 'sel-out-bra' },
];

function bet(overrides: Partial<SettleableBet>): SettleableBet {
  return {
    id: 'bet-1',
    accountId: 'acc-1',
    marketId: 'r16-1',
    selectionId: 'sel-bra',
    potentialReturn: 250,
    ...overrides,
  };
}

describe('splitSettlement', () => {
  it('marks a bet on the winning selection of a settled market as a winner', () => {
    const { winners, losers } = splitSettlement([bet({})], WINNING);
    expect(winners.map((w) => w.id)).toEqual(['bet-1']);
    expect(losers).toEqual([]);
  });

  it('marks a bet on any OTHER selection of a settled market as a loser', () => {
    const { winners, losers } = splitSettlement([bet({ selectionId: 'sel-chi' })], WINNING);
    expect(winners).toEqual([]);
    expect(losers.map((l) => l.id)).toEqual(['bet-1']);
  });

  it('ignores bets on markets that are not being settled', () => {
    const { winners, losers } = splitSettlement([bet({ marketId: 'qf-2' })], WINNING);
    expect(winners).toEqual([]);
    expect(losers).toEqual([]);
  });

  it('settles multiple markets independently in one pass (final + outright)', () => {
    const bets = [
      bet({ id: 'match-winner-bet' }),
      bet({ id: 'match-loser-bet', selectionId: 'sel-chi' }),
      bet({ id: 'outright-winner-bet', marketId: 'outright', selectionId: 'sel-out-bra' }),
      bet({ id: 'outright-loser-bet', marketId: 'outright', selectionId: 'sel-out-arg' }),
    ];
    const { winners, losers } = splitSettlement(bets, WINNING);
    expect(winners.map((w) => w.id)).toEqual(['match-winner-bet', 'outright-winner-bet']);
    expect(losers.map((l) => l.id)).toEqual(['match-loser-bet', 'outright-loser-bet']);
  });

  it('returns nothing when there are no pending bets', () => {
    expect(splitSettlement([], WINNING)).toEqual({ winners: [], losers: [] });
  });

  it('honours multiple winning selections on the same market', () => {
    const dualWinners = [
      { marketId: 'r16-1', selectionId: 'sel-bra' },
      { marketId: 'r16-1', selectionId: 'sel-chi' },
    ];
    const bets = [bet({ id: 'a' }), bet({ id: 'b', selectionId: 'sel-chi' })];
    const { winners, losers } = splitSettlement(bets, dualWinners);
    expect(winners.map((w) => w.id)).toEqual(['a', 'b']);
    expect(losers).toEqual([]);
  });
});
