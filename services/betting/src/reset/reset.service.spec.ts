import { OPENING_BALANCE } from '@arena/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { ResetService } from './reset.service';

describe('ResetService', () => {
  let tx: {
    bet: { deleteMany: ReturnType<typeof vi.fn> };
    ledgerEntry: { deleteMany: ReturnType<typeof vi.fn> };
    account: { deleteMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    otp: { deleteMany: ReturnType<typeof vi.fn> };
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: ResetService;

  beforeEach(() => {
    tx = {
      bet: { deleteMany: vi.fn().mockResolvedValue({ count: 7 }) },
      ledgerEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 12 }) },
      account: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
        updateMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      otp: { deleteMany: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    };
    service = new ResetService(prisma as unknown as PrismaService);
  });

  it('voids bets + ledger, removes bots and resets human wallets — all in ONE transaction', async () => {
    const result = await service.reset();

    expect(result).toEqual({ betsVoided: 7, botsRemoved: 3, walletsReset: 5 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // every bet is voided and the whole ledger is cleared (no where-filter)
    expect(tx.bet.deleteMany).toHaveBeenCalledWith();
    expect(tx.ledgerEntry.deleteMany).toHaveBeenCalledWith();
    // only bot wallets are deleted
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { isBot: true } });
    // human wallets are topped back up to the opening balance, not deleted
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { isBot: false },
      data: { balance: OPENING_BALANCE },
    });
  });

  it('preserves human logins: never deletes human accounts or OTP rows', async () => {
    await service.reset();

    // the only account deletion targets bots — humans survive
    expect(tx.account.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { isBot: true } });
    // OTP login codes are untouched, so signed-in humans stay signed in
    expect(tx.otp.deleteMany).not.toHaveBeenCalled();
  });

  it('reports zeros on an already-clean database', async () => {
    tx.bet.deleteMany.mockResolvedValue({ count: 0 });
    tx.account.deleteMany.mockResolvedValue({ count: 0 });
    tx.account.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.reset();

    expect(result).toEqual({ betsVoided: 0, botsRemoved: 0, walletsReset: 0 });
  });
});
