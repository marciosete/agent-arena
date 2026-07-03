import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adjustWallet, isWholeCentAmount, roundMoney, type TxClient } from './money';

describe('roundMoney', () => {
  it('rounds to whole cents', () => {
    expect(roundMoney(10.239)).toBe(10.24);
    expect(roundMoney(10.234)).toBe(10.23);
  });

  it('cleans up binary floating-point drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(10 * 1.1)).toBe(11);
  });

  it('leaves exact amounts untouched', () => {
    expect(roundMoney(250)).toBe(250);
    expect(roundMoney(0)).toBe(0);
  });
});

describe('isWholeCentAmount', () => {
  it('accepts amounts expressible in whole cents', () => {
    expect(isWholeCentAmount(100)).toBe(true);
    expect(isWholeCentAmount(0.01)).toBe(true);
    expect(isWholeCentAmount(9900.25)).toBe(true);
  });

  it('rejects sub-cent fractions — they would vanish in cent-rounded wallets', () => {
    expect(isWholeCentAmount(0.004)).toBe(false);
    expect(isWholeCentAmount(10.005)).toBe(false);
    expect(isWholeCentAmount(0.001)).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    expect(isWholeCentAmount(Number.NaN)).toBe(false);
    expect(isWholeCentAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('adjustWallet', () => {
  let tx: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tx = { $queryRaw: vi.fn() };
  });

  it('applies the delta atomically and returns the new balance', async () => {
    tx.$queryRaw.mockResolvedValue([{ balance: 9900 }]);

    const balance = await adjustWallet(tx as unknown as TxClient, 'acc-1', -100);

    expect(balance).toBe(9900);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // the delta and account id are bound as parameters of the one guarded UPDATE
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([-100, 'acc-1', -100]);
  });

  it('returns null when no row qualifies (missing account or insufficient funds)', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expect(adjustWallet(tx as unknown as TxClient, 'acc-1', -10_500)).resolves.toBeNull();
  });
});
