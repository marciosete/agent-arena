import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { SimulatorController } from './simulator/simulator.controller';
import { SimulatorService } from './simulator/simulator.service';

@Module({
  controllers: [HealthController, SimulatorController],
  providers: [SimulatorService],
})
export class AppModule {}
