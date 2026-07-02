import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@arena/service-auth';
import { HealthController } from './health/health.controller';
import { DownstreamClient } from './simulator/downstream.client';
import { SimulatorController } from './simulator/simulator.controller';
import { SimulatorService } from './simulator/simulator.service';

@Module({
  // Load .env so SESSION_SECRET (JWT verification), SIMULATOR_ADMIN_KEY, and the downstream
  // URLs/keys land in process.env. Without this the guard verifies against a dev-fallback
  // secret and every token betting signed with the real secret 401s (e.g. GET /state).
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, SimulatorController],
  // Every route requires a valid session JWT by default; @Public() opts out.
  providers: [SimulatorService, DownstreamClient, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
