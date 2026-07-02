import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RunRequestSchema, type RunRequest, type SimState } from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { SimulatorService } from './simulator.service';
import { AdminGuard } from './admin.guard';

@Controller()
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get('state')
  state(): SimState {
    return this.simulator.getState();
  }

  // Control plane — a valid JWT proves authenticated; the x-admin-key
  // (SIMULATOR_ADMIN_KEY, via AdminGuard) proves authorized to drive the finale.
  @Post('play-next')
  @UseGuards(AdminGuard)
  playNext(): Promise<SimState> {
    return this.simulator.playNext();
  }

  @Post('run')
  @UseGuards(AdminGuard)
  run(@Body(new ZodValidationPipe(RunRequestSchema)) body: RunRequest): SimState {
    // Responds immediately; the run continues in the background (GET /state).
    return this.simulator.startRun(body.intervalMs);
  }

  @Post('reset')
  @UseGuards(AdminGuard)
  reset(): SimState {
    return this.simulator.reset();
  }
}
