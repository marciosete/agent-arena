import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/**
 * Public, read-only account endpoints. PrismaService is provided globally by
 * PrismaModule, so it isn't re-declared here.
 */
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
