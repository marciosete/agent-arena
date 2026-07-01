import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@arena/contracts';
import { buildServer } from '../server';

describe('pricing service', () => {
  it('responds to health checks with a valid contract payload', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    expect(body.service).toBe('pricing');
    expect(body.status).toBe('ok');
    await app.close();
  });
});
