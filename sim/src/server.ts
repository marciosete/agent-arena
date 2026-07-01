import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { HealthResponse, SimState } from '@arena/contracts';
import { initialState } from './state';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });

  let state: SimState = initialState();

  app.get('/health', async (): Promise<HealthResponse> => ({
    service: 'sim',
    status: 'ok',
    time: new Date().toISOString(),
  }));

  app.get('/state', async (): Promise<SimState> => state);

  app.post('/reset', async (): Promise<SimState> => {
    state = initialState();
    return state;
  });

  return app;
}
