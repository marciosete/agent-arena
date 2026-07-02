import { describe, expect, it } from 'vitest';
import { OPENING_BALANCE, type Account } from '@arena/contracts';
import { buildLeaderboard } from './leaderboard';

/** Build an `AccountSchema`-valid account; override only what a case cares about. */
function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'punter@example.com',
    name: 'Punter',
    balance: OPENING_BALANCE,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildLeaderboard', () => {
  it('buildLeaderboard orders accounts by balance with name tie-breaks and 1-based ranks', () => {
    const input = [
      account({ name: 'Zara', balance: 12_000 }),
      account({ name: 'Bob', balance: 8_000 }),
      account({ name: 'Alice', balance: 8_000 }),
      account({ name: 'Yan', balance: 15_000 }),
    ];
    const snapshot = input.map((acc) => acc.name);

    const rows = buildLeaderboard(input);

    // 15k first, 12k next, then the 8k tie broken by name (Alice before Bob).
    expect(rows.map((row) => row.account.name)).toEqual(['Yan', 'Zara', 'Alice', 'Bob']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    // Non-mutation: the caller's array keeps its original order.
    expect(input.map((acc) => acc.name)).toEqual(snapshot);
  });

  it('buildLeaderboard measures P&L against the opening balance', () => {
    const rows = buildLeaderboard([
      account({ name: 'Winner', balance: 12_000 }),
      account({ name: 'Flat', balance: OPENING_BALANCE }),
      account({ name: 'Loser', balance: 7_000 }),
    ]);

    const pnlByName = new Map(rows.map((row) => [row.account.name, row.pnl]));
    expect(pnlByName.get('Winner')).toBe(2_000);
    expect(pnlByName.get('Flat')).toBe(0);
    expect(pnlByName.get('Loser')).toBe(-3_000);

    // A custom opening balance shifts every P&L by the same amount.
    const custom = buildLeaderboard([account({ balance: 12_000 })], 5_000);
    expect(custom[0].pnl).toBe(7_000);
  });

  it('buildLeaderboard flags at most the top three positive winners', () => {
    // More than three winners: only the top three are flagged.
    const many = buildLeaderboard([
      account({ name: 'A', balance: 20_000 }),
      account({ name: 'B', balance: 18_000 }),
      account({ name: 'C', balance: 16_000 }),
      account({ name: 'D', balance: 14_000 }),
      account({ name: 'E', balance: 12_000 }),
    ]);
    expect(many.map((row) => row.isTopWinner)).toEqual([true, true, true, false, false]);

    // Exactly one winner: the sole punter in profit is the only "hot" row.
    const one = buildLeaderboard([
      account({ name: 'Up', balance: 11_000 }),
      account({ name: 'Flat', balance: OPENING_BALANCE }),
      account({ name: 'Down', balance: 9_000 }),
    ]);
    expect(one.map((row) => row.isTopWinner)).toEqual([true, false, false]);

    // Everyone losing: nobody is flagged.
    const none = buildLeaderboard([
      account({ name: 'X', balance: 9_000 }),
      account({ name: 'Y', balance: 8_000 }),
      account({ name: 'Z', balance: 5_000 }),
    ]);
    expect(none.map((row) => row.isTopWinner)).toEqual([false, false, false]);
  });
});
