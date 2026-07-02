import { Injectable } from '@nestjs/common';
import { SettleResponseSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { roundMoney } from '../bets/domain';
import { snapBalanceToCents } from '../wallet/balance';
import { splitSettlement, type SettleableBet } from './settlement.domain';

const BET_WON_REASON = 'bet-won';

/**
 * The finale settles hundreds of bot bets in one call against a remote
 * Postgres, at ~3 round-trips per winner — Prisma's default 5s interactive
 * transaction timeout is not sized for that, so give the money move room.
 */
const SETTLE_TX_TIMEOUT_MS = 120_000;
const SETTLE_TX_MAX_WAIT_MS = 10_000;

/**
 * The finale chain, step 5 (integration.md §4): the simulator posts each
 * result's winning selections and we settle every pending bet on those
 * markets — winners are credited their locked-in potentialReturn, losers are
 * marked lost. Every status flip is guarded on `status: 'pending'`, so a
 * replayed or concurrent settlement finds nothing left to claim — a no-op by
 * construction, never a double payout. All of it happens in one `$transaction`.
 */
@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async settle(request: SettleRequest): Promise<SettleResponse> {
    const settledAt = new Date(request.settlement.settledAt);
    const marketIds = [...new Set(request.winningSelections.map((w) => w.marketId))];

    const response = await this.prisma.$transaction(
      async (tx) => {
        const pending: SettleableBet[] = await tx.bet.findMany({
          where: { marketId: { in: marketIds }, status: 'pending' },
        });
        const { winners, losers } = splitSettlement(pending, request.winningSelections);

        let totalPaidOut = 0;
        let settledBets = 0;
        for (const winner of winners) {
          const payout = await this.creditWinner(tx, winner, settledAt);
          if (payout !== null) {
            totalPaidOut += payout;
            settledBets += 1;
          }
        }
        if (losers.length > 0) {
          const lost = await tx.bet.updateMany({
            where: { id: { in: losers.map((loser) => loser.id) }, status: 'pending' },
            data: { status: 'lost', settledAt },
          });
          settledBets += lost.count;
        }
        return { settledBets, totalPaidOut: roundMoney(totalPaidOut) };
      },
      { timeout: SETTLE_TX_TIMEOUT_MS, maxWait: SETTLE_TX_MAX_WAIT_MS }
    );

    return SettleResponseSchema.parse(response);
  }

  /**
   * Credit one winning bet: claim it first (an update guarded on
   * `status: 'pending'` — the database referees races, mirroring placement's
   * guarded debit), and only a successful claim moves money. Returns the
   * payout, or null when another settlement already resolved the bet.
   */
  private async creditWinner(
    tx: Prisma.TransactionClient,
    winner: SettleableBet,
    settledAt: Date
  ): Promise<number | null> {
    const claimed = await tx.bet.updateMany({
      where: { id: winner.id, status: 'pending' },
      data: { status: 'won', settledAt },
    });
    if (claimed.count === 0) {
      return null;
    }
    const wallet = await tx.account.update({
      where: { id: winner.accountId },
      data: { balance: { increment: winner.potentialReturn } },
    });
    const balanceAfter = await snapBalanceToCents(tx, winner.accountId, wallet.balance);
    await tx.ledgerEntry.create({
      data: {
        accountId: winner.accountId,
        delta: winner.potentialReturn,
        balanceAfter,
        reason: BET_WON_REASON,
        refBetId: winner.id,
      },
    });
    return winner.potentialReturn;
  }
}
