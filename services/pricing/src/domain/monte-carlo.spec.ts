import { FIXTURES } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import {
  applySettlement,
  initialBracketState,
  type BracketState,
  type FixtureSlots,
} from './bracket';
import { championProbabilities } from './monte-carlo';
import { createRng } from './rng';

const RUNS = 2000;

function corrupt(mutate: (slots: FixtureSlots) => void): BracketState {
  const state = initialBracketState();
  // R32-13 is still unplayed in the seed, so the walk must sample it.
  const slots = state.get('R32-13') as FixtureSlots;
  mutate(slots);
  return state;
}

describe('championProbabilities', () => {
  it('is deterministic under a fixed seed (DoD)', () => {
    const state = initialBracketState();
    const first = championProbabilities(state, RUNS, createRng(42));
    const second = championProbabilities(state, RUNS, createRng(42));
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('sums to 1 across all teams', () => {
    const probabilities = championProbabilities(initialBracketState(), RUNS, createRng(7));
    const total = [...probabilities.values()].reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('rates Spain (2150) far above Cabo Verde (1550)', () => {
    const probabilities = championProbabilities(initialBracketState(), RUNS, createRng(7));
    expect(probabilities.get('ESP') ?? 0).toBeGreaterThan(probabilities.get('CPV') ?? 0);
    expect(probabilities.get('ESP') ?? 0).toBeGreaterThan(0.05);
  });

  it('gives an eliminated team zero chance', () => {
    // Paraguay knocks France out in R16-2.
    const state = applySettlement(initialBracketState(), 'R16-2', 'PAR');
    const probabilities = championProbabilities(state, RUNS, createRng(7));
    expect(probabilities.get('FRA')).toBeUndefined();
    expect(probabilities.get('PAR') ?? 0).toBeGreaterThan(0);
  });

  it('resolves a fully-settled bracket to a certain champion', () => {
    let state: BracketState = initialBracketState();
    for (const fixture of FIXTURES) {
      const winner = state.get(fixture.id)?.homeTeamId;
      state = applySettlement(state, fixture.id, winner as string);
    }
    const finalWinner = state.get('F-1')?.winnerTeamId as string;
    const probabilities = championProbabilities(state, 100, createRng(1));
    expect(probabilities.get(finalWinner)).toBe(1);
    expect(probabilities.size).toBe(1);
  });

  it('throws when a fixture has an unresolved slot and no winner', () => {
    const state = corrupt((slots) => {
      slots.homeTeamId = null;
    });
    expect(() => championProbabilities(state, 10, createRng(1))).toThrow(
      'Unresolved slots for fixture R32-13'
    );
  });

  it('throws on a team missing from the contract TEAMS', () => {
    const state = corrupt((slots) => {
      slots.homeTeamId = 'XXX';
    });
    expect(() => championProbabilities(state, 10, createRng(1))).toThrow('Unknown team: XXX');
  });
});
