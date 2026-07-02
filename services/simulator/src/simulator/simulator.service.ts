import { Injectable, Logger } from '@nestjs/common';
import { FIXTURES, type SettlementEvent, type SimState } from '@arena/contracts';
import { DownstreamClient } from './downstream.client';
import {
  applyResult,
  nextUnplayedFixture,
  resolveWinningSelections,
  simulateFixture,
} from './engine';
import { mulberry32, type Rng } from './rng';

/**
 * Holds the simulated bracket. In-memory BY DESIGN: the simulation is
 * ephemeral state with a reset button, not a system of record.
 *
 * This service is the finale's engine: `playNext` simulates one fixture and
 * drives the settlement pipeline (pricing /reprice → betting /settle);
 * `startRun` fast-forwards the whole tournament on a timer. Downstream
 * failures never corrupt the bracket — log and carry on (degraded mode).
 */
@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private state: SimState = SimulatorService.initialState();
  private rng: Rng = SimulatorService.newRng();
  /** Bumped on reset so an in-flight run loop notices and stops. */
  private generation = 0;
  private runActive = false;

  constructor(private readonly downstream: DownstreamClient) {}

  private static initialState(): SimState {
    return {
      // The live bracket starts as a copy of the seed; playNext mutates these
      // fixtures (status/scores/winnerTeamId + advancement) as it plays each one, and
      // derives the id arrays below from their status.
      fixtures: FIXTURES.map((f) => ({ ...f })),
      champion: null,
      playedFixtureIds: FIXTURES.filter((f) => f.status === 'finished').map((f) => f.id),
      remainingFixtureIds: FIXTURES.filter((f) => f.status !== 'finished').map((f) => f.id),
    };
  }

  /** Seedable for deterministic tests/replays; otherwise seeded off the clock. */
  private static newRng(): Rng {
    const raw = process.env.SIMULATOR_SEED;
    const seed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return mulberry32(Number.isNaN(seed) ? Date.now() : seed);
  }

  getState(): SimState {
    return this.state;
  }

  reset(): SimState {
    this.generation += 1;
    this.runActive = false;
    this.state = SimulatorService.initialState();
    this.rng = SimulatorService.newRng();
    return this.state;
  }

  /**
   * The finale chain (integration.md §4): simulate the next unplayed fixture,
   * advance the winner, then reprice + settle downstream. A no-op returning
   * the current state when everything is played.
   */
  async playNext(): Promise<SimState> {
    const fixture = nextUnplayedFixture(this.state.fixtures);
    if (!fixture) {
      return this.state;
    }

    const result = simulateFixture(fixture, this.rng);
    applyResult(this.state.fixtures, fixture, result);
    const finalPlayed = fixture.feedsInto === null;
    if (finalPlayed) {
      this.state.champion = result.winnerTeamId;
    }
    this.refreshDerivedIds();

    const settlement: SettlementEvent = {
      fixtureId: fixture.id,
      winnerTeamId: result.winnerTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      decidedOnPenalties: result.decidedOnPenalties,
      settledAt: new Date().toISOString(),
    };
    await this.settleDownstream(settlement, finalPlayed);
    return this.state;
  }

  /**
   * Fast-forward to the final: respond immediately, keep playing in the
   * background with `intervalMs` between fixtures (progress via GET /state).
   * One run at a time; reset stops it.
   */
  startRun(intervalMs: number): SimState {
    if (!this.runActive && nextUnplayedFixture(this.state.fixtures)) {
      this.runActive = true;
      this.runLoop(intervalMs, this.generation).catch((error) => {
        this.logger.error(`run loop stopped unexpectedly: ${messageOf(error)}`);
      });
    }
    return this.state;
  }

  private async runLoop(intervalMs: number, generation: number): Promise<void> {
    try {
      while (this.generation === generation && nextUnplayedFixture(this.state.fixtures)) {
        await this.playNext();
        const morePlanned = nextUnplayedFixture(this.state.fixtures) !== undefined;
        if (this.generation === generation && morePlanned && intervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
    } finally {
      if (this.generation === generation) {
        this.runActive = false;
      }
    }
  }

  private refreshDerivedIds(): void {
    this.state.playedFixtureIds = this.state.fixtures
      .filter((f) => f.status === 'finished')
      .map((f) => f.id);
    this.state.remainingFixtureIds = this.state.fixtures
      .filter((f) => f.status !== 'finished')
      .map((f) => f.id);
  }

  /**
   * Degraded mode: pricing or betting being down must never corrupt the
   * bracket. Without pricing's repriced markets we cannot resolve winners by
   * name, and settling with a wrong/partial list would mark winning bets
   * lost — so a reprice failure skips settlement entirely.
   */
  private async settleDownstream(settlement: SettlementEvent, finalPlayed: boolean): Promise<void> {
    let markets;
    try {
      markets = await this.downstream.reprice(settlement);
    } catch (error) {
      this.logger.warn(
        `pricing /reprice failed for ${settlement.fixtureId}; skipping settlement (degraded): ${messageOf(error)}`
      );
      return;
    }
    try {
      const winningSelections = resolveWinningSelections(markets, settlement, { finalPlayed });
      await this.downstream.settle(settlement, winningSelections);
    } catch (error) {
      this.logger.warn(
        `settlement failed for ${settlement.fixtureId} (degraded): ${messageOf(error)}`
      );
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
