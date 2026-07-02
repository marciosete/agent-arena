import type { SettlementEvent } from '@arena/contracts';

export const TEST_SETTLED_AT = '2026-07-04T23:00:00.000Z';

/** A canonical 2–0 result for specs — one definition shared across suites. */
export function settlementFor(fixtureId: string, winnerTeamId: string): SettlementEvent {
  return {
    fixtureId,
    winnerTeamId,
    homeScore: 2,
    awayScore: 0,
    decidedOnPenalties: false,
    settledAt: TEST_SETTLED_AT,
  };
}
