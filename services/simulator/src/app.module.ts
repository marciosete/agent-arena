import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@arena/service-auth';
import { HealthController } from './health/health.controller';
import { DownstreamClient } from './simulator/downstream.client';
import { SimulatorController } from './simulator/simulator.controller';
import { SimulatorService } from './simulator/simulator.service';

@Module({
  // Load .env so SESSION_SECRET (JWT verification) and SIMULATOR_ADMIN_KEY land in process.env —
  // even with no database. Without this the guard verifies against a dev-fallback secret and every
  // real token 401s. `ignoreEnvFile` under test keeps the specs on the dev secret (signToken).
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
  ],
  controllers: [HealthController, SimulatorController],
  // Every route requires a valid session JWT by default; @Public() opts out.
  providers: [SimulatorService, DownstreamClient, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
