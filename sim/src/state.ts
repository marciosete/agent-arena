import { FIXTURES, type SimState } from '@arena/contracts';

/** The simulation starts from the real-world bracket: nothing played yet. */
export function initialState(): SimState {
  return {
    champion: null,
    playedFixtureIds: [],
    remainingFixtureIds: FIXTURES.filter((f) => f.status === 'scheduled').map((f) => f.id),
  };
}
