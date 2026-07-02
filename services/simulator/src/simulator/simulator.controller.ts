import {
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  UseGuards,
  type PipeTransform,
} from '@nestjs/common';
import { RunRequestSchema, type RunRequest, type SimState } from '@arena/contracts';
import { ZodValidationPipe } from '@arena/service-auth';
import { SimulatorService } from './simulator.service';
import { AdminGuard } from './admin.guard';

/**
 * A body-less POST /run means "use the contract defaults" (intervalMs 2000):
 * express leaves req.body undefined without a JSON body, which the zod object
 * schema would reject — normalize to {} so the schema's defaults apply.
 */
@Injectable()
class EmptyBodyPipe implements PipeTransform {
  transform(value: unknown): unknown {
    return value ?? {};
  }
}

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
  run(
    @Body(new EmptyBodyPipe(), new ZodValidationPipe(RunRequestSchema)) body: RunRequest
  ): SimState {
    // Responds immediately; the run continues in the background (GET /state).
    return this.simulator.startRun(body.intervalMs);
  }

  @Post('reset')
  @UseGuards(AdminGuard)
  reset(): SimState {
    return this.simulator.reset();
  }
}
