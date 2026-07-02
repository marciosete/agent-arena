import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/client';
import { snapBalanceToCents } from './balance';

const ACCOUNT_ID = 'a1111111-1111-4111-8111-111111111111';

function makeTx() {
  return { account: { update: vi.fn().mockResolvedValue({}) } };
}

describe('snapBalanceToCents', () => {
  it('rewrites a drifted float balance to exact cents inside the transaction', async () => {
    const tx = makeTx();

    const result = await snapBalanceToCents(
      tx as unknown as Prisma.TransactionClient,
      ACCOUNT_ID,
      9929.299999999997
    );

    expect(result).toBe(9929.3);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { balance: 9929.3 },
    });
  });

  it('leaves an already-exact balance untouched (no extra write)', async () => {
    const tx = makeTx();

    const result = await snapBalanceToCents(
      tx as unknown as Prisma.TransactionClient,
      ACCOUNT_ID,
      9900
    );

    expect(result).toBe(9900);
    expect(tx.account.update).not.toHaveBeenCalled();
  });
});
