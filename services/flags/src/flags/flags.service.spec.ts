import { Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFINITIONS } from '@arena/contracts';
import { FlagsService } from './flags.service';
import type { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-07-02T10:00:00Z');

function prismaMock() {
  return {
    featureFlag: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  };
}

describe('FlagsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: FlagsService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new FlagsService(prisma as unknown as PrismaService);
  });

  it('seeds every defined flag idempotently on init', async () => {
    await service.onModuleInit();
    expect(prisma.featureFlag.upsert).toHaveBeenCalledTimes(FLAG_DEFINITIONS.length);
    // Seeding must key each upsert on the flag and carry its description —
    // a dropped `where`/`update` payload would corrupt the seed silently.
    const firstCall = prisma.featureFlag.upsert.mock.calls[0][0];
    expect(firstCall).toEqual({
      where: { key: FLAG_DEFINITIONS[0].key },
      update: { description: FLAG_DEFINITIONS[0].description },
      create: {
        key: FLAG_DEFINITIONS[0].key,
        enabled: false,
        description: FLAG_DEFINITIONS[0].description,
      },
    });
  });

  it('does not crash the service when seeding fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    prisma.featureFlag.upsert.mockRejectedValue(new Error('db down'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Flag seeding failed — is the database reachable?',
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('lists flags with ISO timestamps', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: 'punter-markets', enabled: false, description: 'markets', updatedAt: NOW },
    ]);
    const flags = await service.list();
    expect(flags).toEqual([
      {
        key: 'punter-markets',
        enabled: false,
        description: 'markets',
        updatedAt: NOW.toISOString(),
      },
    ]);
    // Deterministic, key-ordered listing is part of the contract.
    expect(prisma.featureFlag.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
  });

  it('updates a known flag', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'punter-markets' });
    prisma.featureFlag.update.mockResolvedValue({
      key: 'punter-markets',
      enabled: true,
      description: 'markets',
      updatedAt: NOW,
    });
    const flag = await service.update('punter-markets', true);
    expect(flag.enabled).toBe(true);
    // The existence check must filter by the specific key, not read any row.
    expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({
      where: { key: 'punter-markets' },
    });
    expect(prisma.featureFlag.update).toHaveBeenCalledWith({
      where: { key: 'punter-markets' },
      data: { enabled: true },
    });
  });

  it('rejects unknown flags with 404', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);
    const error = await service.update('nope', true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('Unknown flag: nope');
  });
});
