import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { FlagsController } from './flags/flags.controller';
import { FlagsService } from './flags/flags.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController, FlagsController],
  providers: [FlagsService],
})
export class AppModule {}
