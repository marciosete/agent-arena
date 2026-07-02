import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@arena/contracts';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a contract-valid health payload', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const body = HealthResponseSchema.parse(controller.check());
    expect(body.service).toBe('flags');
    expect(body.status).toBe('ok');
  });
});
