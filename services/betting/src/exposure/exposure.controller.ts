import { Controller, Get } from '@nestjs/common';
import type { ExposureReport } from '@arena/contracts';
import { ExposureService } from './exposure.service';

/** The trader liability board. Bearer only — reads carry no per-user check. */
@Controller('exposure')
export class ExposureController {
  constructor(private readonly exposure: ExposureService) {}

  @Get()
  report(): Promise<ExposureReport> {
    return this.exposure.report();
  }
}
