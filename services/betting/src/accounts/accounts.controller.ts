import { Controller, Get, Param } from '@nestjs/common';
import type { Account } from '@arena/contracts';
import { AccountsService } from './accounts.service';

/**
 * Account reads. Protected by the global JwtAuthGuard — callers (the punter-web
 * leaderboard, the trader-ops views) send their session Bearer token. Bot
 * provisioning (`POST /accounts`) lives in the admin-keyed AuthController.
 */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  findAll(): Promise<Account[]> {
    return this.accounts.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Account> {
    return this.accounts.findOne(id);
  }
}
