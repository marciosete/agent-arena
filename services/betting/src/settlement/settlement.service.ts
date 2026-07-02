import { Injectable } from '@nestjs/common';
import { SettleResponseSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { roundMoney } from '../bets/domain';
import { splitSettlement, type SettleableBet } from './settlement.domain';

const BET_WON_REASON = 'bet-won';

/**
 * The finale chain, step 5 (integration.md §4): the simulator posts each
 * result's winning selections and we settle every pending bet on those
 * markets — winners are credited their locked-in potentialReturn, losers are
 * marked lost. Only `pending` bets are touched, so replaying a settlement is
 * a no-op by construction. All of it happens in one `$transaction`.
 */
@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async settle(request: SettleRequest): Promise<SettleResponse> {
    const settledAt = new Date(request.settlement.settledAt);
    const marketIds = [...new Set(request.winningSelections.map((w) => w.marketId))];

    const response = await this.prisma.$transaction(async (tx) => {
      const pending: SettleableBet[] = await tx.bet.findMany({
        where: { marketId: { in: marketIds }, status: 'pending' },
      });
      const { winners, losers } = splitSettlement(pending, request.winningSelections);

      let totalPaidOut = 0;
      for (const winner of winners) {
        totalPaidOut += await this.creditWinner(tx, winner, settledAt);
      }
      if (losers.length > 0) {
        await tx.bet.updateMany({
          where: { id: { in: losers.map((loser) => loser.id) } },
          data: { status: 'lost', settledAt },
        });
      }
      return {
        settledBets: winners.length + losers.length,
        totalPaidOut: roundMoney(totalPaidOut),
      };
    });

    return SettleResponseSchema.parse(response);
  }

  /** Credit one winning bet: wallet, bet status, ledger — returns the payout. */
  private async creditWinner(
    tx: Prisma.TransactionClient,
    winner: SettleableBet,
    settledAt: Date
  ): Promise<number> {
    const wallet = await tx.account.update({
      where: { id: winner.accountId },
      data: { balance: { increment: winner.potentialReturn } },
    });
    await tx.bet.update({
      where: { id: winner.id },
      data: { status: 'won', settledAt },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId: winner.accountId,
        delta: winner.potentialReturn,
        balanceAfter: wallet.balance,
        reason: BET_WON_REASON,
        refBetId: winner.id,
      },
    });
    return winner.potentialReturn;
  }
}
