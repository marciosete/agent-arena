import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FeatureFlagSchema, HealthResponseSchema } from '@arena/contracts';
import { signToken } from '@arena/service-auth';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

const NOW = new Date('2026-07-02T10:00:00Z');

describe('AppModule (e2e, prisma mocked)', () => {
  let app: INestApplication;
  let auth: string;
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
    // ConfigModule loads services/flags/.env into process.env; normalise both the admin key
    // (the unguarded write tests assume none) and the JWT secret so the token we sign below is
    // verified with the same (dev) secret the global guard uses.
    delete process.env.FLAGS_ADMIN_KEY;
    delete process.env.SESSION_SECRET;
    auth = `Bearer ${signToken('test-account')}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the full module graph and serves /health (public, no token)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('flags');
  });

  it('requires a JWT — /flags is 401 without a token', async () => {
    const response = await request(app.getHttpServer()).get('/flags');
    expect(response.status).toBe(401);
  });

  it('lists flags (with a token)', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: 'punter-markets', enabled: false, description: 'markets', updatedAt: NOW },
    ]);
    const response = await request(app.getHttpServer())
      .get('/flags')
      .set('Authorization', auth)
      .expect(200);
    const flags = response.body.map((f: unknown) => FeatureFlagSchema.parse(f));
    expect(flags[0].key).toBe('punter-markets');
  });

  it('rejects an invalid flag update body with 400', async () => {
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .set('Authorization', auth)
      .send({ enabled: 'yes' });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown flags', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .put('/flags/nope')
      .set('Authorization', auth)
      .send({ enabled: true });
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
      .set('Authorization', auth)
      .send({ enabled: true })
      .expect(200);
    expect(FeatureFlagSchema.parse(response.body).enabled).toBe(true);
  });

  describe('with FLAGS_ADMIN_KEY configured', () => {
    beforeAll(() => {
      process.env.FLAGS_ADMIN_KEY = 'test-admin-key';
    });

    afterAll(() => {
      delete process.env.FLAGS_ADMIN_KEY;
    });

    it('allows reads with a valid token', async () => {
      const response = await request(app.getHttpServer()).get('/flags').set('Authorization', auth);
      expect(response.status).toBe(200);
    });

    it('rejects writes without the admin key (even with a valid token)', async () => {
      const response = await request(app.getHttpServer())
        .put('/flags/punter-markets')
        .set('Authorization', auth)
        .send({ enabled: true });
      expect(response.status).toBe(401);
    });

    it('accepts writes with a token + the admin key', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ key: 'punter-markets' });
      prisma.featureFlag.update.mockResolvedValue({
        key: 'punter-markets',
        enabled: false,
        description: 'markets',
        updatedAt: NOW,
      });
      const response = await request(app.getHttpServer())
        .put('/flags/punter-markets')
        .set('Authorization', auth)
        .set('x-admin-key', 'test-admin-key')
        .send({ enabled: false });
      expect(response.status).toBe(200);
    });
  });
});
