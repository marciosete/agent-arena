import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@arena/contracts';
import { buildServer } from '../server';

describe('betting service', () => {
  it('responds to health checks with a valid contract payload', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json()).service).toBe('betting');
    await app.close();
  });

  it('starts with an empty account book', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/accounts' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });
});
