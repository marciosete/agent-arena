import { describe, expect, it } from 'vitest';
import { FIXTURES, HealthResponseSchema, SimStateSchema } from '@arena/contracts';
import { buildServer } from '../server';

describe('sim service', () => {
  it('responds to health checks with a valid contract payload', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json()).service).toBe('sim');
    await app.close();
  });

  it('starts from the real-world bracket with every fixture unplayed', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/state' });

    const state = SimStateSchema.parse(response.json());
    expect(state.champion).toBeNull();
    expect(state.playedFixtureIds).toEqual([]);
    expect(state.remainingFixtureIds).toHaveLength(FIXTURES.length);
    await app.close();
  });

  it('returns to the initial state on reset', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'POST', url: '/reset' });

    const state = SimStateSchema.parse(response.json());
    expect(state.playedFixtureIds).toEqual([]);
    await app.close();
  });
});
