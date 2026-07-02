import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountSchema, type Account } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma's Account row — the fields we map onto the contract shape. */
interface AccountRecord {
  id: string;
  email: string | null;
  name: string;
  balance: number;
  isBot: boolean;
  createdAt: Date;
}

/**
 * Read-only access to accounts. Accounts are public (the leaderboard renders
 * them), so these routes are unauthenticated. Every row is validated against
 * the contract's AccountSchema before it leaves the service.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Account[]> {
    const rows = await this.prisma.account.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row: AccountRecord) => this.toAccount(row));
  }

  async findOne(id: string): Promise<Account> {
    const row = await this.prisma.account.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Account ${id} not found`);
    }
    return this.toAccount(row);
  }

  private toAccount(account: AccountRecord): Account {
    return AccountSchema.parse({
      id: account.id,
      email: account.email,
      name: account.name,
      balance: account.balance,
      isBot: account.isBot,
      createdAt: account.createdAt.toISOString(),
    });
  }
}
