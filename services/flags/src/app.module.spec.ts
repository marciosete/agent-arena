import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FeatureFlagSchema, HealthResponseSchema } from '@arena/contracts';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

const NOW = new Date('2026-07-02T10:00:00Z');

describe('AppModule (e2e, prisma mocked)', () => {
  let app: INestApplication;
  const prisma = {
    featureFlag: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    onModuleDestroy: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the full module graph and serves /health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('flags');
  });

  it('lists flags', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: 'punter-markets', enabled: false, description: 'markets', updatedAt: NOW },
    ]);
    const response = await request(app.getHttpServer()).get('/flags').expect(200);
    const flags = response.body.map((f: unknown) => FeatureFlagSchema.parse(f));
    expect(flags[0].key).toBe('punter-markets');
  });

  it('rejects an invalid flag update body with 400', async () => {
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .send({ enabled: 'yes' });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown flags', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);
    const response = await request(app.getHttpServer()).put('/flags/nope').send({ enabled: true });
    expect(response.status).toBe(404);
  });

  it('flips a known flag', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'punter-markets' });
    prisma.featureFlag.update.mockResolvedValue({
      key: 'punter-markets',
      enabled: true,
      description: 'markets',
      updatedAt: NOW,
    });
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .send({ enabled: true })
      .expect(200);
    expect(FeatureFlagSchema.parse(response.body).enabled).toBe(true);
  });
});
