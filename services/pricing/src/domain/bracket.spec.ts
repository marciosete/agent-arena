import { FIXTURES } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import {
  aliveTeams,
  applySettlement,
  initialBracketState,
  isFinalFixture,
  priceableFixtureIds,
  type FixtureSlots,
} from './bracket';

const R32_13 = 'R32-13';
const R32_14 = 'R32-14';
const R16_5 = 'R16-5';
const R16_7 = 'R16-7';
const FINAL = 'F-1';

describe('initialBracketState', () => {
  it('mirrors the contract FIXTURES', () => {
    const state = initialBracketState();
    expect(state.size).toBe(FIXTURES.length);
    expect(state.get('R16-2')).toEqual({
      homeTeamId: 'PAR',
      awayTeamId: 'FRA',
      winnerTeamId: null,
    });
    expect(state.get(R16_7)).toEqual({ homeTeamId: null, awayTeamId: null, winnerTeamId: null });
  });

  it('propagates results already played in the seed into downstream slots', () => {
    const state = initialBracketState();
    expect(state.get('R32-9')?.winnerTeamId).toBe('POR');
    // R32-9 (POR) and R32-10 (ESP) both feed R16-5 — the seed leaves those
    // slots null, so pricing must fill them itself.
    expect(state.get(R16_5)).toEqual({ homeTeamId: 'POR', awayTeamId: 'ESP', winnerTeamId: null });
    expect(state.get('R16-6')).toEqual({
      homeTeamId: 'USA',
      awayTeamId: 'BEL',
      winnerTeamId: null,
    });
  });
});

describe('applySettlement', () => {
  it('records the winner and fills the downstream home slot', () => {
    const state = initialBracketState();
    const next = applySettlement(state, R32_13, 'ARG');
    expect(next.get(R32_13)?.winnerTeamId).toBe('ARG');
    expect(next.get(R16_7)?.homeTeamId).toBe('ARG');
  });

  it('fills the downstream away slot per feedsIntoSlot', () => {
    const next = applySettlement(initialBracketState(), R32_14, 'EGY');
    expect(next.get(R16_7)?.awayTeamId).toBe('EGY');
  });

  it('is pure: the input state is untouched', () => {
    const state = initialBracketState();
    applySettlement(state, R32_13, 'ARG');
    expect(state.get(R32_13)?.winnerTeamId).toBeNull();
    expect(state.get(R16_7)?.homeTeamId).toBeNull();
  });

  it('handles the final, which feeds into nothing', () => {
    const next = applySettlement(initialBracketState(), FINAL, 'FRA');
    expect(next.get(FINAL)?.winnerTeamId).toBe('FRA');
  });

  it('throws on an unknown fixture', () => {
    expect(() => applySettlement(initialBracketState(), 'NOPE', 'FRA')).toThrow(
      'Unknown fixture: NOPE'
    );
  });

  it('throws when a fixture feeds into a fixture missing from the state', () => {
    const state = initialBracketState();
    const truncated = new Map<string, FixtureSlots>([...state].filter(([id]) => id !== R16_7));
    expect(() => applySettlement(truncated, R32_13, 'ARG')).toThrow(
      `Fixture ${R32_13} feeds into unknown fixture ${R16_7}`
    );
  });
});

describe('priceableFixtureIds', () => {
  it('finds the 10 undecided fixtures with both teams known at seed time', () => {
    const priceable = priceableFixtureIds(initialBracketState());
    expect(priceable).toHaveLength(10);
    expect(priceable).toContain(R32_13);
    expect(priceable).toContain('R16-2');
    expect(priceable).toContain(R16_5); // determined by seed results
    expect(priceable).not.toContain('R32-9'); // already decided in the seed
    expect(priceable).not.toContain(R16_7);
  });

  it('excludes settled fixtures and includes fixtures that became determined', () => {
    let state = applySettlement(initialBracketState(), R32_13, 'ARG');
    state = applySettlement(state, R32_14, 'AUS');
    const priceable = priceableFixtureIds(state);
    expect(priceable).not.toContain(R32_13);
    expect(priceable).not.toContain(R32_14);
    expect(priceable).toContain(R16_7);
  });
});

describe('aliveTeams', () => {
  it('starts with the 20 teams the seed results have not eliminated', () => {
    const alive = aliveTeams(initialBracketState());
    expect(alive).toHaveLength(20);
    const ids = alive.map((team) => team.id);
    for (const eliminated of ['CRO', 'AUT', 'BIH', 'SEN']) {
      expect(ids).not.toContain(eliminated);
    }
  });

  it("eliminates the settled fixture's loser", () => {
    const state = applySettlement(initialBracketState(), R32_13, 'ARG');
    const alive = aliveTeams(state);
    expect(alive).toHaveLength(19);
    expect(alive.map((team) => team.id)).not.toContain('CPV');
  });

  it('eliminates the home team when the away team wins', () => {
    const state = applySettlement(initialBracketState(), R32_13, 'CPV');
    expect(aliveTeams(state).map((team) => team.id)).not.toContain('ARG');
  });
});

describe('fixture structure helpers', () => {
  it('identifies the final', () => {
    expect(isFinalFixture(FINAL)).toBe(true);
    expect(isFinalFixture(R32_13)).toBe(false);
    expect(isFinalFixture('NOPE')).toBe(false);
  });
});
