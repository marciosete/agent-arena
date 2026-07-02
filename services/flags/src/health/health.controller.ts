import { Controller, Get } from '@nestjs/common';
import { Public } from '@arena/service-auth';
import type { HealthResponse } from '@arena/contracts';

// Render's platform health checks are unauthenticated, so /health stays public.
@Public()
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
