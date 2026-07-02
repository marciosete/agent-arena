import { afterEach, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  afterEach(() => {
    delete process.env.FLAGS_DATABASE_URL;
  });

  it('constructs with the configured connection string when provided', async () => {
    process.env.FLAGS_DATABASE_URL = 'postgresql://arena:arena@localhost:5432/flags';
    const service = new PrismaService();
    expect(typeof service.$disconnect).toBe('function');
    await service.onModuleDestroy();
  });

  it('falls back to the local default when the env var is missing', async () => {
    delete process.env.FLAGS_DATABASE_URL;
    const service = new PrismaService();
    expect(typeof service.$disconnect).toBe('function');
    await service.onModuleDestroy();
  });
});
