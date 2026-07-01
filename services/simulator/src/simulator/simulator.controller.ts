import { Controller, Get, Post } from '@nestjs/common';
import type { SimState } from '@arena/contracts';
import { SimulatorService } from './simulator.service';

@Controller()
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get('state')
  state(): SimState {
    return this.simulator.getState();
  }

  @Post('reset')
  reset(): SimState {
    return this.simulator.reset();
  }
}
