import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signToken } from '@arena/service-auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@arena/contracts';
import { AppModule } from './app.module';

// A throwaway non-@Public route, mounted alongside the real AppModule, so we can
// assert the globally-registered JwtAuthGuard actually protects normal routes.
@Controller('__probe')
class ProbeController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves /health without a token (public)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(HealthResponseSchema.parse(response.body).service).toBe('pricing');
  });

  it('rejects a protected route without a bearer token (401)', async () => {
    const response = await request(app.getHttpServer()).get('/__probe');
    expect(response.status).toBe(401);
  });

  it('allows a protected route with a valid bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/__probe')
      .set('Authorization', `Bearer ${signToken('test-account-id')}`);
    expect(response.status).toBe(200);
  });
});
