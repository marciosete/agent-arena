import type { Prisma } from '../../generated/client';
import { roundMoney } from '../bets/domain';

/**
 * Wallet balances live in Float columns (the pre-built Account model), so a
 * raw `increment`/`decrement` accumulates IEEE-754 drift (7 × $10.10 debits
 * leave 9929.299999999997). After every atomic adjustment, snap the stored
 * balance back to cents inside the same transaction so the ledger's
 * `balanceAfter` and the wallet always agree to the cent.
 */
export async function snapBalanceToCents(
  tx: Prisma.TransactionClient,
  accountId: string,
  rawBalance: number
): Promise<number> {
  const rounded = roundMoney(rawBalance);
  if (rounded !== rawBalance) {
    await tx.account.update({ where: { id: accountId }, data: { balance: rounded } });
  }
  return rounded;
}
