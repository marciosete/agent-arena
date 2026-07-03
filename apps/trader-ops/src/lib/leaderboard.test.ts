import { describe, expect, it } from 'vitest';
import { OPENING_BALANCE, type Account } from '@arena/contracts';
import { rankAccounts } from './leaderboard';

let seq = 0;
function acc(overrides: Partial<Account> = {}): Account {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${n}`,
    email: `p${seq}@example.com`,
    name: `Punter ${seq}`,
    balance: OPENING_BALANCE,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('rankAccounts ordering', () => {
  it('orders by balance descending and assigns 1-based ranks', () => {
    const ranked = rankAccounts([
      acc({ name: 'Mid', balance: 12_000 }),
      acc({ name: 'Top', balance: 15_000 }),
      acc({ name: 'Low', balance: 9_000 }),
    ]);
    expect(ranked.map((r) => r.account.name)).toEqual(['Top', 'Mid', 'Low']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks balance ties by name ascending (stable order)', () => {
    const ranked = rankAccounts([
      acc({ name: 'Yara', balance: 11_000 }),
      acc({ name: 'Ada', balance: 11_000 }),
      acc({ name: 'Mira', balance: 11_000 }),
    ]);
    expect(ranked.map((r) => r.account.name)).toEqual(['Ada', 'Mira', 'Yara']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', () => {
    const input = [acc({ balance: 9_000 }), acc({ balance: 13_000 })];
    const snapshot = input.map((a) => a.balance);
    rankAccounts(input);
    expect(input.map((a) => a.balance)).toEqual(snapshot);
  });
});

describe('rankAccounts P&L', () => {
  it('computes P&L against the opening balance: winner positive, loser negative, untouched zero', () => {
    const ranked = rankAccounts([
      acc({ name: 'Winner', balance: 13_500 }),
      acc({ name: 'Flat', balance: OPENING_BALANCE }),
      acc({ name: 'Loser', balance: 6_200 }),
    ]);
    const pnl = Object.fromEntries(ranked.map((r) => [r.account.name, r.pnl]));
    expect(pnl.Winner).toBe(3_500);
    expect(pnl.Flat).toBe(0);
    expect(pnl.Loser).toBe(-3_800);
  });
});

describe('rankAccounts hot flag', () => {
  it('flags only the top-three winners as hot', () => {
    const ranked = rankAccounts([
      acc({ name: 'A', balance: 18_000 }),
      acc({ name: 'B', balance: 16_000 }),
      acc({ name: 'C', balance: 14_000 }),
      acc({ name: 'D', balance: 12_000 }),
    ]);
    const hot = Object.fromEntries(ranked.map((r) => [r.account.name, r.hot]));
    expect(hot).toEqual({ A: true, B: true, C: true, D: false });
  });

  it('never flags a losing account as hot, even inside the top three', () => {
    const ranked = rankAccounts([
      acc({ name: 'Down', balance: 8_000 }),
      acc({ name: 'AlsoDown', balance: 7_500 }),
    ]);
    expect(ranked.every((r) => r.hot)).toBe(false);
  });

  it('does not flag a break-even account (P&L exactly zero) as hot', () => {
    const ranked = rankAccounts([acc({ name: 'EvenTop', balance: OPENING_BALANCE })]);
    expect(ranked[0].hot).toBe(false);
  });
});
