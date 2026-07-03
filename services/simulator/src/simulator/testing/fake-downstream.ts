import {
  TEAMS,
  type Market,
  type ResetResponse,
  type SettleResponse,
  type SettlementEvent,
  type SimState,
} from '@arena/contracts';
import type { WinningSelection } from '../winning-selections';
import { matchWinnerMarket, outrightMarket } from './markets';

export const SETTLE_OK: SettleResponse = { settledBets: 1, totalPaidOut: 100 };
export const RESET_OK: ResetResponse = { betsVoided: 2, botsRemoved: 3, walletsReset: 4 };

/**
 * A contract-faithful pricing+betting double: /reprice answers with a
 * real-shaped Market[] for the fixture that was just settled (plus the
 * outright), and every call is recorded so the finale chain can be asserted.
 * `stateProvider` reads the live bracket so mid-tournament fixtures (whose
 * teams are not in the seed) still get correctly-named selections.
 */
export class FakeDownstream {
  callOrder: string[] = [];
  repriceCalls: SettlementEvent[] = [];
  settleCalls: { settlement: SettlementEvent; winningSelections: WinningSelection[] }[] = [];
  marketsReturned: Market[][] = [];
  resetPricingCalls = 0;
  resetBettingCalls = 0;
  failReprice = false;
  failSettle = false;
  failResetPricing = false;
  failResetBetting = false;
  /** when set, reprice stalls on it — lets tests interleave resets mid-flight */
  repriceGate: Promise<void> | null = null;

  constructor(private readonly stateProvider: () => SimState) {}

  async reprice(settlement: SettlementEvent): Promise<Market[]> {
    this.callOrder.push('reprice');
    this.repriceCalls.push(settlement);
    if (this.repriceGate) {
      await this.repriceGate;
    }
    if (this.failReprice) {
      throw new Error('pricing down');
    }
    const fixture = this.stateProvider().fixtures.find((f) => f.id === settlement.fixtureId);
    if (!fixture?.homeTeamId || !fixture.awayTeamId) {
      throw new Error(`fake pricing has no teams for ${settlement.fixtureId}`);
    }
    const markets = [
      matchWinnerMarket(fixture.id, fixture.homeTeamId, fixture.awayTeamId),
      outrightMarket(TEAMS.map((team) => team.id)),
    ];
    this.marketsReturned.push(markets);
    return markets;
  }

  settle(
    settlement: SettlementEvent,
    winningSelections: WinningSelection[]
  ): Promise<SettleResponse> {
    this.callOrder.push('settle');
    this.settleCalls.push({ settlement, winningSelections });
    return this.failSettle ? Promise.reject(new Error('betting down')) : Promise.resolve(SETTLE_OK);
  }

  resetPricing(): Promise<Market[]> {
    this.callOrder.push('resetPricing');
    this.resetPricingCalls += 1;
    return this.failResetPricing
      ? Promise.reject(new Error('pricing reset down'))
      : Promise.resolve([]);
  }

  resetBetting(): Promise<ResetResponse> {
    this.callOrder.push('resetBetting');
    this.resetBettingCalls += 1;
    return this.failResetBetting
      ? Promise.reject(new Error('betting reset down'))
      : Promise.resolve(RESET_OK);
  }
}
