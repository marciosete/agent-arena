import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@arena/service-auth';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { BracketStore, PrismaBracketStore } from './simulator/bracket.store';
import { DownstreamClient } from './simulator/downstream.client';
import { SimulatorController } from './simulator/simulator.controller';
import { SimulatorService } from './simulator/simulator.service';

@Module({
  // Load .env so SESSION_SECRET (JWT verification + signing the simulator's own admin service
  // tokens) and SIMULATOR_DATABASE_URL land in process.env. Without this the guard verifies against
  // a dev-fallback secret and every real token 401s. `ignoreEnvFile` under test keeps the specs on
  // the dev secret (signToken).
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    PrismaModule,
  ],
  controllers: [HealthController, SimulatorController],
  // Every route requires a valid session JWT by default; @Public() opts out.
  // The bracket is written through to the database via the PrismaBracketStore.
  providers: [
    SimulatorService,
    DownstreamClient,
    { provide: BracketStore, useClass: PrismaBracketStore },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
