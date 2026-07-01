import { describe, expect, it } from 'vitest';
import { FIXTURES, SimStateSchema } from '@arena/contracts';
import { SimulatorService } from './simulator.service';

describe('SimulatorService', () => {
  it('starts from the real-world bracket with every fixture unplayed', () => {
    const service = new SimulatorService();
    const state = SimStateSchema.parse(service.getState());

    expect(state.champion).toBeNull();
    expect(state.playedFixtureIds).toEqual([]);
    expect(state.remainingFixtureIds).toHaveLength(FIXTURES.length);
  });

  it('returns to the initial state on reset', () => {
    const service = new SimulatorService();
    const state = SimStateSchema.parse(service.reset());

    expect(state.playedFixtureIds).toEqual([]);
    expect(state.remainingFixtureIds).toHaveLength(FIXTURES.length);
  });
});
