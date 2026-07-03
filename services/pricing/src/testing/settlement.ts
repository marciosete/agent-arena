import type { SettlementEvent } from '@arena/contracts';

/** A contract-valid SettlementEvent with sensible defaults for tests. */
export function makeSettlement(
  fixtureId: string,
  winnerTeamId: string,
  overrides: Partial<SettlementEvent> = {}
): SettlementEvent {
  return {
    fixtureId,
    winnerTeamId,
    homeScore: 2,
    awayScore: 1,
    decidedOnPenalties: false,
    settledAt: '2026-07-04T20:00:00.000Z',
    ...overrides,
  };
}
