import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BetSchema,
  type Bet,
  type BetQuery,
  type Market,
  type PlaceBetRequest,
} from '@arena/contracts';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { adjustWallet, isWholeCentAmount, type TxClient } from '../money/money';
import { PricingClient } from './pricing-client.service';
import { computePotentialReturn, isPriceWithinTolerance } from './bet-rules';

/** The Prisma Bet row — the fields we map onto the contract shape. */
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

@Injectable()
export class BetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingClient
  ) {}

  /**
   * The money path (integration.md §5). The account is the TOKEN's — never the
   * body's. Order matters: idempotency replay first (no second debit, no
   * pricing call), then the live-price check against pricing, and only then
   * money — debit + bet + ledger in ONE transaction, with the guarded debit
   * making stake ≤ balance atomic and the unique idempotencyKey letting the
   * database referee concurrent replays.
   */
  async placeBet(accountId: string, request: PlaceBetRequest): Promise<Bet> {
    if (!isWholeCentAmount(request.stake)) {
      // Wallets are cent-precise: a sub-cent stake would round away to a free bet.
      throw new BadRequestException('Stake must be a whole number of cents');
    }

    const replayed = await this.findReplayedBet(accountId, request);
    if (replayed) {
      return replayed;
    }

    const market = await this.pricing.fetchMarket(request.marketId);
    const selection = this.resolveOpenSelection(market, request);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const balanceAfter = await this.debitWallet(tx as TxClient, accountId, request.stake);
        const bet = await tx.bet.create({
          data: {
            accountId,
            marketId: market.id,
            marketName: market.name,
            selectionId: selection.id,
            stake: request.stake,
            price: selection.price,
            potentialReturn: computePotentialReturn(request.stake, selection.price),
            idempotencyKey: request.idempotencyKey,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            accountId,
            delta: -request.stake,
            balanceAfter,
            reason: 'bet-placed',
            refBetId: bet.id,
          },
        });
        return this.toBet(bet);
      });
    } catch (error) {
      // A concurrent twin won the unique-constraint race on idempotencyKey:
      // our whole transaction (debit included) rolled back — return the original.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const original = await this.findReplayedBet(accountId, request);
        if (original) {
          return original;
        }
      }
      throw error;
    }
  }

  /** The my-bets read: no per-user check (integration.md §1), plain filters. */
  async findBets(query: BetQuery): Promise<Bet[]> {
    const rows = await this.prisma.bet.findMany({
      where: { accountId: query.accountId, status: query.status },
      orderBy: { placedAt: 'desc' },
    });
    return rows.map((row) => this.toBet(row));
  }

  /**
   * A replay only counts as a replay when it is the SAME request: same
   * account, same market/selection/stake. A reused key with a different
   * payload must not silently return the wrong bet — that's a client bug
   * surfaced as 409, and it also stops one account probing another's keys.
   */
  private async findReplayedBet(accountId: string, request: PlaceBetRequest): Promise<Bet | null> {
    const existing = await this.prisma.bet.findUnique({
      where: { idempotencyKey: request.idempotencyKey },
    });
    if (!existing) {
      return null;
    }
    const samePayload =
      existing.accountId === accountId &&
      existing.marketId === request.marketId &&
      existing.selectionId === request.selectionId &&
      existing.stake === request.stake;
    if (!samePayload) {
      throw new ConflictException('Idempotency key already used for a different bet');
    }
    return this.toBet(existing);
  }

  /** Validate the LIVE market: open, selection known, price within tolerance. */
  private resolveOpenSelection(market: Market, request: PlaceBetRequest) {
    const selection = market.selections.find((s) => s.id === request.selectionId);
    if (!selection) {
      throw new BadRequestException(
        `Selection ${request.selectionId} is not part of market ${market.id}`
      );
    }
    if (market.status !== 'open') {
      throw new ConflictException(`Market ${market.id} is not open for betting`);
    }
    if (!isPriceWithinTolerance(request.acceptedPrice, selection.price)) {
      throw new ConflictException(
        `Price moved: accepted ${request.acceptedPrice}, live ${selection.price}`
      );
    }
    return selection;
  }

  /** Guarded debit via the shared wallet helper; maps "no row" to 401/400. */
  private async debitWallet(tx: TxClient, accountId: string, stake: number): Promise<number> {
    const balanceAfter = await adjustWallet(tx, accountId, -stake);
    if (balanceAfter === null) {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) {
        throw new UnauthorizedException('Unknown account');
      }
      throw new BadRequestException('Stake exceeds available balance');
    }
    return balanceAfter;
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
