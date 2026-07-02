import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@arena/contracts';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      service: 'flags',
      status: 'ok',
      time: new Date().toISOString(),
    };
  }
}
