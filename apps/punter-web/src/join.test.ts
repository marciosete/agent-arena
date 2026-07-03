import { describe, expect, it } from 'vitest';
import { isBettable, marketsByFixture, selectionForTeam } from './join';
import { marketFor, outrightMarket } from './__tests__/harness';

describe('marketsByFixture (the fixtureId join)', () => {
  it('indexes match markets by fixtureId and skips the outright', () => {
    const map = marketsByFixture([marketFor('R32-9'), outrightMarket()]);
    expect(map.get('R32-9')?.id).toBe('R32-9');
    expect(map.size).toBe(1);
  });

  it('degrades to an empty map when pricing is down', () => {
    expect(marketsByFixture(null).size).toBe(0);
  });
});

describe('selectionForTeam (name-equality join, never guessed ids)', () => {
  const market = marketFor('R32-9');

  it('resolves a team to its selection via Team.name === Selection.name', () => {
    expect(selectionForTeam(market, 'POR')?.id).toBe('sel-POR');
    expect(selectionForTeam(market, 'CRO')?.id).toBe('sel-CRO');
  });

  it('returns undefined for unknown teams, empty slots, or a missing market', () => {
    expect(selectionForTeam(market, 'FRA')).toBeUndefined();
    expect(selectionForTeam(market, null)).toBeUndefined();
    expect(selectionForTeam(undefined, 'POR')).toBeUndefined();
    expect(selectionForTeam(market, 'ZZZ')).toBeUndefined();
  });
});

describe('isBettable', () => {
  it('is true only for an open market', () => {
    expect(isBettable(marketFor('R32-9'))).toBe(true);
    expect(isBettable(marketFor('R32-9', { status: 'suspended' }))).toBe(false);
    expect(isBettable(marketFor('R32-9', { status: 'settled' }))).toBe(false);
    expect(isBettable(undefined)).toBe(false);
  });
});
