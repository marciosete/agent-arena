import { Module } from '@nestjs/common';
import { ResetController } from './reset.controller';
import { ResetService } from './reset.service';

/**
 * Admin-only demo reset. PrismaService is provided globally by PrismaModule, so
 * it isn't re-declared here.
 */
@Module({
  controllers: [ResetController],
  providers: [ResetService],
})
export class ResetModule {}
