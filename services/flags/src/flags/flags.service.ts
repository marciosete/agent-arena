import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { FLAG_DEFINITIONS, type FeatureFlag } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FlagsService implements OnModuleInit {
  private readonly logger = new Logger(FlagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent seed: every defined flag exists, new ones start dark. */
  async onModuleInit(): Promise<void> {
    try {
      for (const definition of FLAG_DEFINITIONS) {
        await this.prisma.featureFlag.upsert({
          where: { key: definition.key },
          update: { description: definition.description },
          create: { key: definition.key, enabled: false, description: definition.description },
        });
      }
    } catch (error) {
      this.logger.error('Flag seeding failed — is the database reachable?', error);
    }
  }

  async list(): Promise<FeatureFlag[]> {
    const flags = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return flags.map((flag) => ({ ...flag, updatedAt: flag.updatedAt.toISOString() }));
  }

  async update(key: string, enabled: boolean): Promise<FeatureFlag> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Unknown flag: ${key}`);
    }
    const flag = await this.prisma.featureFlag.update({ where: { key }, data: { enabled } });
    return { ...flag, updatedAt: flag.updatedAt.toISOString() };
  }
}
