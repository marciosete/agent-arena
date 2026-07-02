import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { SimState } from '@arena/contracts';
import { SimulatorService } from './simulator.service';
import { AdminGuard } from './admin.guard';

@Controller()
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get('state')
  state(): SimState {
    return this.simulator.getState();
  }

  // Control plane — guarded by SIMULATOR_ADMIN_KEY. The workstream's
  // /play-next and /run endpoints MUST carry @UseGuards(AdminGuard) too.
  @Post('reset')
  @UseGuards(AdminGuard)
  reset(): SimState {
    return this.simulator.reset();
  }
}
