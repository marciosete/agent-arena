import { describe, expect, it } from 'vitest';
import { classifySettlement, type SettleableBet } from './settlement-rules';

const FIXTURE_MARKET = 'qf-1';
const OUTRIGHT_MARKET = 'outright';
const WINNER = 'sel-bra';
const LOSER = 'sel-arg';

let nextId = 0;
function bet(overrides: Partial<SettleableBet> = {}): SettleableBet {
  nextId += 1;
  return {
    id: `bet-${nextId}`,
    accountId: `acc-${nextId}`,
    marketId: FIXTURE_MARKET,
    selectionId: WINNER,
    potentialReturn: 250,
    ...overrides,
  };
}

describe('classifySettlement', () => {
  it('marks bets on the winning selection as won', () => {
    const winner = bet();
    const outcome = classifySettlement(
      [winner],
      [{ marketId: FIXTURE_MARKET, selectionId: WINNER }]
    );

    expect(outcome.won).toEqual([winner]);
    expect(outcome.lostBetIds).toEqual([]);
  });

  it('marks every other bet on a settled market as lost', () => {
    const winner = bet();
    const loser = bet({ selectionId: LOSER });
    const outcome = classifySettlement(
      [winner, loser],
      [{ marketId: FIXTURE_MARKET, selectionId: WINNER }]
    );

    expect(outcome.won).toEqual([winner]);
    expect(outcome.lostBetIds).toEqual([loser.id]);
  });

  it('never touches bets on markets that are not being settled', () => {
    const untouched = bet({ marketId: 'sf-1' });
    const outcome = classifySettlement(
      [untouched],
      [{ marketId: FIXTURE_MARKET, selectionId: WINNER }]
    );

    expect(outcome.won).toEqual([]);
    expect(outcome.lostBetIds).toEqual([]);
  });

  it('settles several markets in one pass (the final settles match + outright)', () => {
    const finalWinner = bet();
    const finalLoser = bet({ selectionId: LOSER });
    const outrightWinner = bet({ marketId: OUTRIGHT_MARKET, selectionId: 'sel-champion' });
    const outrightLoser = bet({ marketId: OUTRIGHT_MARKET, selectionId: 'sel-runner-up' });

    const outcome = classifySettlement(
      [finalWinner, finalLoser, outrightWinner, outrightLoser],
      [
        { marketId: FIXTURE_MARKET, selectionId: WINNER },
        { marketId: OUTRIGHT_MARKET, selectionId: 'sel-champion' },
      ]
    );

    expect(outcome.won).toEqual([finalWinner, outrightWinner]);
    expect(outcome.lostBetIds).toEqual([finalLoser.id, outrightLoser.id]);
  });

  it('returns an empty outcome when there is nothing to settle', () => {
    expect(classifySettlement([], [{ marketId: FIXTURE_MARKET, selectionId: WINNER }])).toEqual({
      won: [],
      lostBetIds: [],
    });
    expect(classifySettlement([bet()], [])).toEqual({ won: [], lostBetIds: [] });
  });

  it('ignores duplicate winning-selection entries (no double classification)', () => {
    const winner = bet();
    const outcome = classifySettlement(
      [winner],
      [
        { marketId: FIXTURE_MARKET, selectionId: WINNER },
        { marketId: FIXTURE_MARKET, selectionId: WINNER },
      ]
    );

    expect(outcome.won).toEqual([winner]);
  });
});
