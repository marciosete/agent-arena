import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared money primitives for the betting service. Every wallet movement —
 * the placement debit and the settlement credit — goes through
 * {@link adjustWallet}, so the money-moving SQL exists exactly once.
 */

/** Round a currency amount to whole cents, clearing binary float drift. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * True when the amount is expressible in whole cents. Wallets are kept
 * cent-precise, so sub-cent amounts must be rejected at the boundary — a
 * 0.004 debit would otherwise round away to nothing while the bet it funds
 * still pays out.
 */
export function isWholeCentAmount(value: number): boolean {
  return Number.isFinite(value) && roundMoney(value) === value;
}

/** Interactive-transaction client: same delegates as PrismaService, minus $transaction. */
export type TxClient = Omit<PrismaService, '$transaction' | '$connect' | '$disconnect'>;

/**
 * Atomic wallet adjustment: ONE guarded UPDATE that applies the (whole-cent)
 * delta, refuses to take the balance below zero, and returns the new balance
 * for the ledger snapshot — so two concurrent movements can never double-spend
 * the same funds. Returns null when no row qualified: the account doesn't
 * exist, or a debit exceeded the available balance.
 */
export async function adjustWallet(
  tx: TxClient,
  accountId: string,
  delta: number
): Promise<number | null> {
  const rows = await tx.$queryRaw<{ balance: number }[]>`
    UPDATE "Account"
    SET "balance" = ROUND(("balance" + ${delta})::numeric, 2)::double precision
    WHERE "id" = ${accountId} AND ROUND(("balance" + ${delta})::numeric, 2) >= 0
    RETURNING "balance"`;
  return rows.length === 0 ? null : rows[0].balance;
}
