import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Account, HealthResponse } from '@arena/contracts';

/** In-memory store — replaced with a real ledger during the build. */
const accounts: Account[] = [];

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });

  app.get('/health', async (): Promise<HealthResponse> => ({
    service: 'betting',
    status: 'ok',
    time: new Date().toISOString(),
  }));

  app.get('/accounts', async (): Promise<Account[]> => accounts);

  return app;
}
