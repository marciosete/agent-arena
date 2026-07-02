import { Controller, Get, Param } from '@nestjs/common';
import type { Account } from '@arena/contracts';
import { AccountsService } from './accounts.service';

/**
 * Public account reads — no Bearer guard, so the punter-web leaderboard and the
 * trader-ops views can list accounts without a session. Bot provisioning
 * (`POST /accounts`) lives in the admin-keyed AuthController.
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
