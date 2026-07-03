import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RunRequestSchema, type RunRequest, type SimState } from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { SimulatorService } from './simulator.service';
import { AdminGuard } from './admin.guard';

// Express 5 leaves req.body undefined on a body-less POST; the contract's
// intervalMs default must still apply, so undefined parses as {}.
const RunBodySchema = RunRequestSchema.default({});

@Controller()
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  /** The live bracket — the ONLY source of live results for the apps. */
  @Get('state')
  state(): SimState {
    return this.simulator.getState();
  }

  // Control plane — every mutation needs x-admin-key on top of the session JWT
  // (a JWT proves authenticated; the admin key proves authorized to drive fate).

  @Post('play-next')
  @UseGuards(AdminGuard)
  playNext(): Promise<SimState> {
    return this.simulator.playNext();
  }

  @Post('run')
  @UseGuards(AdminGuard)
  run(@Body(new ZodValidationPipe(RunBodySchema)) body: RunRequest): SimState {
    return this.simulator.run(body.intervalMs);
  }

  @Post('reset')
  @UseGuards(AdminGuard)
  reset(): SimState {
    return this.simulator.reset();
  }
}
