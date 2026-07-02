import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BetSchema, type Bet, type BetQuery, type PlaceBetRequest } from '@arena/contracts';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingClient } from '../pricing/pricing-client';
import {
  MIN_STAKE,
  computePotentialReturn,
  findSelection,
  isPriceWithinTolerance,
  roundMoney,
} from './domain';
import { snapBalanceToCents } from '../wallet/balance';

const BET_PLACED_REASON = 'bet-placed';
const BET_VOIDED_REASON = 'bet-voided';

/** The Bet row shape (generated client) that we map onto the contract Bet. */
interface BetRecord {
  id: string;
  accountId: string;
  marketId: string;
  selectionId: string;
  stake: number;
  price: number;
  potentialReturn: number;
  status: string;
  placedAt: Date;
  settledAt: Date | null;
}

/** The price facts locked at placement, resolved from the LIVE market. */
interface LockedPrice {
  price: number;
  potentialReturn: number;
  marketName: string;
}

/**
 * Prisma surfaces a violated unique constraint as error code P2002. The Bet
 * table's only unique constraint is idempotencyKey, so P2002 during placement
 * means: the same key was inserted concurrently — a replay race.
 */
function isIdempotencyKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class BetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingClient
  ) {}

  /**
   * Place a bet for the token's account (integration.md §5): replay check,
   * live-price validation against pricing, then debit + bet + ledger in one
   * `$transaction`. The unique constraint on idempotencyKey is the referee for
   * replays — the pre-check is just the fast path; a concurrent duplicate
   * surfaces as P2002 and resolves to the original bet, never a second debit.
   */
  async placeBet(accountId: string, request: PlaceBetRequest): Promise<Bet> {
    const normalized = this.normalizeStake(request);

    const replayed = await this.findByIdempotencyKey(normalized.idempotencyKey);
    if (replayed) {
      return this.toReplayedBet(replayed, accountId, normalized);
    }

    const locked = await this.validateLivePrice(normalized);

    let created: BetRecord;
    try {
      created = await this.prisma.$transaction((tx) =>
        this.executePlacement(tx, accountId, normalized, locked)
      );
    } catch (error) {
      if (isIdempotencyKeyViolation(error)) {
        const original = await this.findByIdempotencyKey(normalized.idempotencyKey);
        if (original) {
          return this.toReplayedBet(original, accountId, normalized);
        }
      }
      throw error;
    }

    return this.toBet(await this.voidIfSettledMeanwhile(created));
  }

  /** The my-bets view — reads carry no per-user check; the query is a filter. */
  async findBets(query: BetQuery): Promise<Bet[]> {
    const rows = await this.prisma.bet.findMany({
      where: { accountId: query.accountId, status: query.status },
      orderBy: { placedAt: 'desc' },
    });
    return rows.map((row: BetRecord) => this.toBet(row));
  }

  /**
   * Stakes are money: quantise to cents before anything is debited so the
   * stored stake, the wallet debit and the ledger delta are the same number.
   * A stake below one cent is rejected outright — its payout would round to
   * an unrepresentable 0.
   */
  private normalizeStake(request: PlaceBetRequest): PlaceBetRequest {
    const stake = roundMoney(request.stake);
    if (stake < MIN_STAKE) {
      throw new BadRequestException(`Stake must be at least ${MIN_STAKE}`);
    }
    return { ...request, stake };
  }

  /**
   * The real HTTP call to pricing (never a local assumption): the market must
   * exist, be open, carry the selection, and its live price must sit within
   * tolerance of what the punter accepted — else 409, the price moved.
   */
  private async validateLivePrice(request: PlaceBetRequest): Promise<LockedPrice> {
    const market = await this.pricing.fetchMarket(request.marketId);
    if (market.id !== request.marketId) {
      throw new NotFoundException(`Market ${request.marketId} not found`);
    }
    if (market.status !== 'open') {
      throw new ConflictException(`Market ${request.marketId} is not open for betting`);
    }
    const selection = findSelection(market, request.selectionId);
    if (!selection) {
      throw new NotFoundException(
        `Selection ${request.selectionId} not found on market ${request.marketId}`
      );
    }
    if (!isPriceWithinTolerance(selection.price, request.acceptedPrice)) {
      throw new ConflictException('Price moved — re-accept the current price and try again');
    }
    return {
      price: selection.price,
      potentialReturn: computePotentialReturn(request.stake, selection.price),
      marketName: market.name,
    };
  }

  /**
   * The money move, inside the caller's transaction: a debit whose WHERE
   * clause carries the funds check (`balance >= stake`), so a concurrent
   * double-spend loses the race in the database; then the pending Bet and its
   * ledger entry. Any failure aborts the whole transaction.
   */
  private async executePlacement(
    tx: Prisma.TransactionClient,
    accountId: string,
    request: PlaceBetRequest,
    locked: LockedPrice
  ): Promise<BetRecord> {
    const debited = await tx.account.updateMany({
      where: { id: accountId, balance: { gte: request.stake } },
      data: { balance: { decrement: request.stake } },
    });
    if (debited.count === 0) {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) {
        throw new UnauthorizedException('Session account no longer exists');
      }
      throw new BadRequestException('Insufficient funds for this stake');
    }

    const wallet = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    const balanceAfter = await snapBalanceToCents(tx, accountId, wallet.balance);
    const bet = await tx.bet.create({
      data: {
        accountId,
        marketId: request.marketId,
        marketName: locked.marketName,
        selectionId: request.selectionId,
        stake: request.stake,
        price: locked.price,
        potentialReturn: locked.potentialReturn,
        idempotencyKey: request.idempotencyKey,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId,
        delta: -request.stake,
        balanceAfter,
        reason: BET_PLACED_REASON,
        refBetId: bet.id,
      },
    });
    return bet;
  }

  /**
   * Close the placement/settlement race: the market was open when the price
   * was validated, but a settlement may have snapshotted its pending bets
   * before our insert committed — that would strand this bet `pending` with
   * the stake gone. Re-check the live market AFTER the commit; if it settled
   * in the window, reclaim the bet (guarded on `status: 'pending'`, so a
   * settlement that DID see it wins the race) and refund the stake.
   */
  private async voidIfSettledMeanwhile(bet: BetRecord): Promise<BetRecord> {
    let marketStatus: string;
    try {
      marketStatus = (await this.pricing.fetchMarket(bet.marketId)).status;
    } catch {
      // Pricing hiccup: leave the bet pending — settlement stays the authority.
      return bet;
    }
    if (marketStatus !== 'settled') {
      return bet;
    }
    return this.refundStrandedBet(bet);
  }

  private refundStrandedBet(bet: BetRecord): Promise<BetRecord> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.bet.updateMany({
        where: { id: bet.id, status: 'pending' },
        data: { status: 'void', settledAt: new Date() },
      });
      if (claimed.count === 1) {
        const wallet = await tx.account.update({
          where: { id: bet.accountId },
          data: { balance: { increment: bet.stake } },
        });
        const balanceAfter = await snapBalanceToCents(tx, bet.accountId, wallet.balance);
        await tx.ledgerEntry.create({
          data: {
            accountId: bet.accountId,
            delta: bet.stake,
            balanceAfter,
            reason: BET_VOIDED_REASON,
            refBetId: bet.id,
          },
        });
      }
      // count === 0 means settlement got there first and resolved the bet —
      // either way, return the row as the database now has it.
      return tx.bet.findUniqueOrThrow({ where: { id: bet.id } });
    });
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<BetRecord | null> {
    return this.prisma.bet.findUnique({ where: { idempotencyKey } });
  }

  /**
   * A replayed key returns the ORIGINAL bet — but only to the account that
   * placed it, and only for the SAME bet: a reused key carrying a different
   * market/selection/stake is a client bug, and silently answering with the
   * old bet would let the caller believe the new one was placed.
   */
  private toReplayedBet(row: BetRecord, accountId: string, request: PlaceBetRequest): Bet {
    if (row.accountId !== accountId) {
      throw new ConflictException('Idempotency key already in use');
    }
    const samePayload =
      row.marketId === request.marketId &&
      row.selectionId === request.selectionId &&
      row.stake === request.stake;
    if (!samePayload) {
      throw new ConflictException('Idempotency key was already used for a different bet');
    }
    return this.toBet(row);
  }

  private toBet(row: BetRecord): Bet {
    return BetSchema.parse({
      id: row.id,
      accountId: row.accountId,
      marketId: row.marketId,
      selectionId: row.selectionId,
      stake: row.stake,
      price: row.price,
      potentialReturn: row.potentialReturn,
      status: row.status,
      placedAt: row.placedAt.toISOString(),
      settledAt: row.settledAt?.toISOString() ?? null,
    });
  }
}
