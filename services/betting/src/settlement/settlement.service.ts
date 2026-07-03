import { Injectable } from '@nestjs/common';
import { SettleResponseSchema, type SettleRequest, type SettleResponse } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { adjustWallet, roundMoney, type TxClient } from '../money/money';
import { classifySettlement, type WinningSelection } from './settlement-rules';

/**
 * Finale-sized settlements pay hundreds of bets in one transaction; Prisma's
 * default 5s interactive timeout would abort them wholesale, so give the
 * payout loop real room (and keep the default queue wait).
 */
const SETTLE_TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };

/**
 * A placement transaction can commit between one pass's pending-bet snapshot
 * and its writes; extra passes sweep those stragglers so no winning bet is
 * left `pending` on a settled market. Three passes bounds the loop.
 */
const MAX_SETTLE_PASSES = 3;

/**
 * Step 5 of the finale chain (integration.md §4): the simulator posts the
 * settlement event plus the winning selection per affected market, and every
 * matching `pending` bet is settled in ONE transaction per pass — winners
 * flip to `won` and are credited `potentialReturn` (with a ledger row),
 * everything else pending on those markets flips to `lost`. Only `pending`
 * bets are touched, and each flip is individually guarded, so replaying the
 * same settlement (or racing it) is a no-op that never pays twice.
 */
@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async settle(request: SettleRequest): Promise<SettleResponse> {
    const marketIds = [...new Set(request.winningSelections.map((w) => w.marketId))];
    let settledBets = 0;
    let totalPaidOut = 0;

    if (marketIds.length > 0) {
      const settledAt = new Date(request.settlement.settledAt);
      for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
        const result = await this.settlePass(marketIds, request.winningSelections, settledAt);
        settledBets += result.settledBets;
        totalPaidOut += result.totalPaidOut;
        if (result.settledBets === 0) {
          break; // nothing left pending on these markets — swept clean
        }
      }
    }

    return SettleResponseSchema.parse({ settledBets, totalPaidOut: roundMoney(totalPaidOut) });
  }

  /** One snapshot-classify-write cycle over the settled markets. */
  private settlePass(
    marketIds: string[],
    winningSelections: readonly WinningSelection[],
    settledAt: Date
  ): Promise<{ settledBets: number; totalPaidOut: number }> {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.bet.findMany({
        where: { marketId: { in: marketIds }, status: 'pending' },
      });
      const outcome = classifySettlement(pending, winningSelections);

      let settledBets = 0;
      let totalPaidOut = 0;
      for (const bet of outcome.won) {
        const marked = await tx.bet.updateMany({
          where: { id: bet.id, status: 'pending' },
          data: { status: 'won', settledAt },
        });
        if (marked.count === 0) {
          continue; // a racing settlement already flipped it — never pay twice
        }
        const balanceAfter = await this.creditWallet(tx as TxClient, bet);
        await tx.ledgerEntry.create({
          data: {
            accountId: bet.accountId,
            delta: bet.potentialReturn,
            balanceAfter,
            reason: 'bet-won',
            refBetId: bet.id,
          },
        });
        settledBets += 1;
        totalPaidOut += bet.potentialReturn;
      }

      if (outcome.lostBetIds.length > 0) {
        const lost = await tx.bet.updateMany({
          where: { id: { in: outcome.lostBetIds }, status: 'pending' },
          data: { status: 'lost', settledAt },
        });
        settledBets += lost.count;
      }

      return { settledBets, totalPaidOut };
    }, SETTLE_TX_OPTIONS);
  }

  private async creditWallet(
    tx: TxClient,
    bet: { id: string; accountId: string; potentialReturn: number }
  ): Promise<number> {
    const balanceAfter = await adjustWallet(tx, bet.accountId, bet.potentialReturn);
    if (balanceAfter === null) {
      // Accounts are never deleted; hitting this means the ledger would lie — abort the tx.
      throw new Error(`Account ${bet.accountId} missing while crediting a won bet`);
    }
    return balanceAfter;
  }
}
