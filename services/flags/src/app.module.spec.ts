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
  let auth: string; // ordinary punter — a valid session, but no admin claim
  let adminAuth: string; // allowlisted operator / service token (admin claim set)
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
    // ConfigModule loads services/flags/.env into process.env; normalise the JWT
    // secret so the tokens we sign below are verified with the same (dev) secret
    // the global guard uses. Admin authority is now the token's `admin` claim.
    delete process.env.SESSION_SECRET;
    auth = `Bearer ${signToken('test-account')}`;
    adminAuth = `Bearer ${signToken('ops-account', { admin: true })}`;
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

  it('lists flags for any logged-in user (plain Bearer read, no admin claim needed)', async () => {
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

  it('rejects a flag update with no token (401)', async () => {
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .send({ enabled: true });
    expect(response.status).toBe(401);
  });

  it('rejects a flag update from a non-admin token (403)', async () => {
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .set('Authorization', auth)
      .send({ enabled: true });
    expect(response.status).toBe(403);
  });

  it('rejects an invalid flag update body with 400 (admin token)', async () => {
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .set('Authorization', adminAuth)
      .send({ enabled: 'yes' });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown flags (admin token)', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .put('/flags/nope')
      .set('Authorization', adminAuth)
      .send({ enabled: true });
    expect(response.status).toBe(404);
  });

  it('flips a known flag for an admin token', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'punter-markets' });
    prisma.featureFlag.update.mockResolvedValue({
      key: 'punter-markets',
      enabled: true,
      description: 'markets',
      updatedAt: NOW,
    });
    const response = await request(app.getHttpServer())
      .put('/flags/punter-markets')
      .set('Authorization', adminAuth)
      .send({ enabled: true })
      .expect(200);
    expect(FeatureFlagSchema.parse(response.body).enabled).toBe(true);
  });
});
