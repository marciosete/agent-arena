import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/client';

/**
 * Prisma connects lazily on first query, so the service boots even when the
 * database isn't reachable yet (e.g. before .env is configured).
 * The connection string comes from SIMULATOR_DATABASE_URL — see .env.example.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      datasourceUrl:
        process.env.SIMULATOR_DATABASE_URL ?? 'postgresql://arena:arena@localhost:5432/simulator',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
