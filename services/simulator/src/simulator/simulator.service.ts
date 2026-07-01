import { Injectable } from '@nestjs/common';
import { FIXTURES, type SimState } from '@arena/contracts';

/**
 * Holds the simulated bracket. In-memory BY DESIGN: the simulation is
 * ephemeral state with a reset button, not a system of record.
 */
@Injectable()
export class SimulatorService {
  private state: SimState = SimulatorService.initialState();

  private static initialState(): SimState {
    return {
      champion: null,
      playedFixtureIds: [],
      remainingFixtureIds: FIXTURES.filter((f) => f.status === 'scheduled').map((f) => f.id),
    };
  }

  getState(): SimState {
    return this.state;
  }

  reset(): SimState {
    this.state = SimulatorService.initialState();
    return this.state;
  }
}
