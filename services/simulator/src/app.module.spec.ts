import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema, SimStateSchema } from '@arena/contracts';
import { AppModule } from './app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the full module graph and serves /health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('simulator');
  });

  it('serves the seeded bracket on /state', async () => {
    const response = await request(app.getHttpServer()).get('/state').expect(200);
    expect(SimStateSchema.parse(response.body).champion).toBeNull();
  });

  it('allows reset when no admin key is configured', async () => {
    delete process.env.SIMULATOR_ADMIN_KEY;
    const response = await request(app.getHttpServer()).post('/reset');
    expect(response.status).toBe(201);
  });

  describe('with SIMULATOR_ADMIN_KEY configured', () => {
    beforeAll(() => {
      process.env.SIMULATOR_ADMIN_KEY = 'test-sim-key';
    });

    afterAll(() => {
      delete process.env.SIMULATOR_ADMIN_KEY;
    });

    it('keeps /state public', async () => {
      const response = await request(app.getHttpServer()).get('/state');
      expect(response.status).toBe(200);
    });

    it('rejects reset without the admin key', async () => {
      const response = await request(app.getHttpServer()).post('/reset');
      expect(response.status).toBe(401);
    });

    it('accepts reset with the admin key', async () => {
      const response = await request(app.getHttpServer())
        .post('/reset')
        .set('x-admin-key', 'test-sim-key');
      expect(response.status).toBe(201);
    });
  });
});
