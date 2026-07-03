import { Injectable } from '@nestjs/common';
import { OPENING_BALANCE, ResetResponseSchema, type ResetResponse } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-only demo reset (Reset-bracket cascade): wipe the betting activity so a
 * fresh run starts clean, WITHOUT destroying human logins. In ONE transaction
 * it voids every bet, clears the whole ledger, deletes the ephemeral bot
 * wallets, and resets each human wallet back to OPENING_BALANCE. Human Account
 * rows and their Otp login codes are deliberately preserved, so anyone who has
 * signed in stays signed in.
 */
@Injectable()
export class ResetService {
  constructor(private readonly prisma: PrismaService) {}

  async reset(): Promise<ResetResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const bets = await tx.bet.deleteMany();
      await tx.ledgerEntry.deleteMany();
      const bots = await tx.account.deleteMany({ where: { isBot: true } });
      const wallets = await tx.account.updateMany({
        where: { isBot: false },
        data: { balance: OPENING_BALANCE },
      });
      return {
        betsVoided: bets.count,
        botsRemoved: bots.count,
        walletsReset: wallets.count,
      };
    });

    return ResetResponseSchema.parse(result);
  }
}
