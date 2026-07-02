import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@arena/service-auth';
import { HealthController } from './health/health.controller';
import { SimulatorController } from './simulator/simulator.controller';
import { SimulatorService } from './simulator/simulator.service';

@Module({
  controllers: [HealthController, SimulatorController],
  // Every route requires a valid session JWT by default; @Public() opts out.
  providers: [SimulatorService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
