import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '@arena/service-auth';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { BetsModule } from './bets/bets.module';
import { SettlementModule } from './settlement/settlement.module';
import { ExposureModule } from './exposure/exposure.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    BetsModule,
    SettlementModule,
    ExposureModule,
  ],
  controllers: [HealthController],
  // Every route requires a valid session JWT by default; @Public() opts out.
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
