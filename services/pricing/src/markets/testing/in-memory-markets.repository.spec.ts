import { describe, expect, it } from 'vitest';
import { makeSettlement } from '../../testing/settlement';
import { InMemoryMarketsRepository } from './in-memory-markets.repository';

const R32_9 = 'R32-9';

async function seeded(): Promise<InMemoryMarketsRepository> {
  const repository = new InMemoryMarketsRepository();
  await repository.createFixtureStatesIfMissing([
    { id: R32_9, homeTeamId: 'POR', awayTeamId: 'CRO', winnerTeamId: null },
  ]);
  return repository;
}

describe('InMemoryMarketsRepository ↔ Prisma parity', () => {
  it('rejects an unknown settle id without applying any partial writes (rollback parity)', async () => {
    const repository = await seeded();
    await expect(
      repository.applyReprice({
        fixtureStates: [{ id: R32_9, set: { winnerTeamId: 'POR' } }],
        upsertMarkets: [],
        settleMarketIds: ['nope'],
        event: makeSettlement(R32_9, 'POR'),
      })
    ).rejects.toThrow('Cannot settle unknown market: nope');
    const state = await repository.getBracketState();
    expect(state.get(R32_9)?.winnerTeamId).toBeNull();
    expect(repository.events).toHaveLength(0);
  });

  it('guards winner writes on the winner still being unset (updateMany parity)', async () => {
    const repository = await seeded();
    const apply = (winner: string) =>
      repository.applyReprice({
        fixtureStates: [{ id: R32_9, set: { winnerTeamId: winner } }],
        upsertMarkets: [],
        settleMarketIds: [],
        event: makeSettlement(R32_9, winner),
      });
    await apply('POR');
    await apply('CRO'); // a late conflicting writer must not overwrite the result
    const state = await repository.getBracketState();
    expect(state.get(R32_9)?.winnerTeamId).toBe('POR');
  });

  it('ignores patches for unknown fixture rows (zero-row updateMany parity)', async () => {
    const repository = await seeded();
    await repository.applyReprice({
      fixtureStates: [{ id: 'NOPE', set: { homeTeamId: 'POR' } }],
      upsertMarkets: [],
      settleMarketIds: [],
      event: makeSettlement(R32_9, 'POR'),
    });
    expect((await repository.getBracketState()).has('NOPE')).toBe(false);
  });
});
