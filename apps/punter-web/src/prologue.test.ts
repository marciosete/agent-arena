import { describe, expect, it } from 'vitest';
import { FIXTURES, type Fixture } from '@arena/contracts';
import { PROLOGUE_FIXTURES, prologueTeamById, withPrologue } from './prologue';

describe('the R32 prologue (display-only history)', () => {
  it('completes the seed into a full 32-team bracket: every R16 slot gains a feeder', () => {
    const merged = withPrologue(FIXTURES);
    expect(merged).toHaveLength(FIXTURES.length + 8);
    const fedSlots = new Set(
      merged
        .filter((fixture) => fixture.feedsInto && fixture.feedsIntoSlot)
        .map((fixture) => `${fixture.feedsInto}:${fixture.feedsIntoSlot}`)
    );
    for (const slot of ['home', 'away']) {
      for (const id of ['R16-1', 'R16-2', 'R16-3', 'R16-4']) {
        expect(fedSlots.has(`${id}:${slot}`), `${id}:${slot}`).toBe(true);
      }
    }
  });

  it('records the real results — Brazil beat Japan, shoot-outs derive the pens marker', () => {
    const brazil = PROLOGUE_FIXTURES.find((fixture) => fixture.id === 'R32-5')!;
    expect(brazil.homeTeamId).toBe('BRA');
    expect(brazil.awayTeamId).toBe('JPN');
    expect(brazil.winnerTeamId).toBe('BRA');
    expect(`${brazil.homeScore}-${brazil.awayScore}`).toBe('2-1');
    const shootouts = PROLOGUE_FIXTURES.filter(
      (fixture) => fixture.homeScore === fixture.awayScore
    );
    expect(shootouts.map((fixture) => fixture.winnerTeamId).sort()).toEqual(['MAR', 'PAR']);
  });

  it('steps aside when the live data already explains a slot', () => {
    // The platform someday ships the real R32-5: the prologue entry must retire.
    const realGame: Fixture = { ...PROLOGUE_FIXTURES[4], id: 'R32-real-5' };
    const merged = withPrologue([...FIXTURES, realGame]);
    // R16-3's feeders: the shipped real game (home) + the NOR prologue (away).
    expect(merged.filter((fixture) => fixture.feedsInto === 'R16-3')).toHaveLength(2);
    expect(merged.find((fixture) => fixture.id === 'R32-5')).toBeUndefined();
    expect(merged.find((fixture) => fixture.id === 'R32-real-5')).toBeDefined();
  });

  it('refuses entries that contradict the live occupant or point nowhere', () => {
    const disagreeing = FIXTURES.map((fixture) =>
      fixture.id === 'R16-3' ? { ...fixture, homeTeamId: 'JPN' } : fixture
    );
    const merged = withPrologue(disagreeing);
    expect(merged.find((fixture) => fixture.id === 'R32-5')).toBeUndefined();

    const noTargets = FIXTURES.filter((fixture) => fixture.round !== 'R16');
    for (const fixture of withPrologue(noTargets)) {
      expect(fixture.id.startsWith('R32-P')).toBe(false);
    }
  });

  it('knows the eliminated nations the contract seed dropped', () => {
    expect(prologueTeamById('JPN')?.name).toBe('Japan');
    expect(prologueTeamById('RSA')?.flag).toBe('🇿🇦');
    expect(prologueTeamById('POR')).toBeUndefined(); // live nations stay contract-owned
  });
});
