import { Controller, Get } from '@nestjs/common';
import type { ExposureReport } from '@arena/contracts';
import { ExposureService } from './exposure.service';

/**
 * Trader back office. Protected by the global JwtAuthGuard; like every read
 * on the platform there is no per-user check — any logged-in caller may look.
 */
@Controller('exposure')
export class ExposureController {
  constructor(private readonly exposure: ExposureService) {}

  @Get()
  report(): Promise<ExposureReport> {
    return this.exposure.report();
  }
}
