import { PORTS } from '@arena/contracts';
import { buildServer } from './server';

const app = await buildServer();

try {
  await app.listen({ port: PORTS.pricing, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
