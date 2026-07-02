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
      // The live bracket starts as a copy of the seed; the workstream mutates these
      // fixtures (status/scores/winnerTeamId + advancement) as it plays each one, and
      // derives the id arrays below from their status.
      fixtures: FIXTURES.map((f) => ({ ...f })),
      champion: null,
      playedFixtureIds: FIXTURES.filter((f) => f.status === 'finished').map((f) => f.id),
      remainingFixtureIds: FIXTURES.filter((f) => f.status !== 'finished').map((f) => f.id),
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
