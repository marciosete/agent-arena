import { Injectable, Logger } from '@nestjs/common';
import { FIXTURES, type SettlementEvent, type SimState } from '@arena/contracts';
import { DownstreamClient } from './downstream.client';
import {
  applyResult,
  nextUnplayedFixture,
  resolveWinningSelections,
  simulateFixture,
  type WinningSelection,
} from './engine';
import { mulberry32, type Rng } from './rng';

/**
 * A settlement the downstream pipeline hasn't delivered yet. Kept in a FIFO so
 * a transient pricing/betting outage never permanently desyncs them: pricing
 * rebuilds its bracket from the settlements it actually receives, so results
 * MUST arrive in play order — the queue head blocks until delivered or given
 * up on. `winningSelections` is filled once reprice has succeeded, so a
 * betting-only failure retries without repricing again.
 */
interface PendingSettlement {
  settlement: SettlementEvent;
  finalPlayed: boolean;
  winningSelections?: WinningSelection[];
  attempts: number;
}

const MAX_SETTLEMENT_ATTEMPTS = 5;

/**
 * Holds the simulated bracket. In-memory BY DESIGN: the simulation is
 * ephemeral state with a reset button, not a system of record.
 *
 * This service is the finale's engine: `playNext` simulates one fixture and
 * drives the settlement pipeline (pricing /reprice → betting /settle);
 * `startRun` fast-forwards the whole tournament on a timer. Downstream
 * failures never corrupt the bracket — settlements queue up and retry on
 * later plays (degraded mode).
 */
@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private state: SimState = SimulatorService.initialState();
  private rng: Rng = this.newRng();
  /** Bumped on reset so in-flight run loops and settlement flushes go stale. */
  private generation = 0;
  private runActive = false;
  private pending: PendingSettlement[] = [];
  private flushing = false;

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
  private newRng(): Rng {
    const raw = process.env.SIMULATOR_SEED;
    if (raw === undefined || raw === '') {
      return mulberry32(Date.now());
    }
    const seed = Number(raw);
    if (Number.isNaN(seed)) {
      this.logger.warn(
        `SIMULATOR_SEED '${raw}' is not a number — seeding off the clock (non-deterministic)`
      );
      return mulberry32(Date.now());
    }
    return mulberry32(seed);
  }

  getState(): SimState {
    return this.state;
  }

  reset(): SimState {
    this.generation += 1;
    this.runActive = false;
    this.pending = [];
    this.state = SimulatorService.initialState();
    this.rng = this.newRng();
    return this.state;
  }

  /**
   * The finale chain (integration.md §4): simulate the next unplayed fixture,
   * advance the winner, then reprice + settle downstream. A no-op returning
   * the current state when everything is played (it still retries any queued
   * settlements, so an operator can re-drive a stalled pipeline).
   */
  async playNext(): Promise<SimState> {
    const generation = this.generation;
    const fixture = nextUnplayedFixture(this.state.fixtures);
    if (!fixture) {
      await this.flushSettlements(generation);
      return this.state;
    }

    const result = simulateFixture(fixture, this.rng);
    applyResult(this.state.fixtures, fixture, result);
    const finalPlayed = fixture.feedsInto === null;
    if (finalPlayed) {
      this.state.champion = result.winnerTeamId;
    }
    this.refreshDerivedIds();

    this.pending.push({
      settlement: {
        fixtureId: fixture.id,
        winnerTeamId: result.winnerTeamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        decidedOnPenalties: result.decidedOnPenalties,
        settledAt: new Date().toISOString(),
      },
      finalPlayed,
      attempts: 0,
    });
    await this.flushSettlements(generation);
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
   * Deliver queued settlements strictly in play order, oldest first. A failed
   * head stays queued (bounded attempts) and blocks the rest — pricing must
   * see the feeder's result before the fed fixture's. The `flushing` latch
   * serializes concurrent plays; the generation fence stops a flush that
   * outlived a reset before it can move money for a voided bracket.
   */
  private async flushSettlements(generation: number): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      while (this.generation === generation && this.pending.length > 0) {
        const head = this.pending[0];
        if (await this.deliver(head, generation)) {
          this.pending.shift();
          continue;
        }
        head.attempts += 1;
        if (head.attempts < MAX_SETTLEMENT_ATTEMPTS) {
          return; // retry the head on the next play, keeping order
        }
        this.logger.error(
          `giving up on settlement for ${head.settlement.fixtureId} after ${head.attempts} attempts`
        );
        this.pending.shift();
      }
    } finally {
      this.flushing = false;
    }
  }

  /** One delivery attempt: reprice (unless already resolved), then settle. */
  private async deliver(item: PendingSettlement, generation: number): Promise<boolean> {
    try {
      if (!item.winningSelections) {
        const markets = await this.downstream.reprice(item.settlement);
        if (this.generation !== generation) {
          return false; // reset landed mid-flight — don't settle a voided result
        }
        item.winningSelections = resolveWinningSelections(markets, item.settlement, {
          finalPlayed: item.finalPlayed,
        });
      }
      if (this.generation !== generation) {
        return false;
      }
      await this.downstream.settle(item.settlement, item.winningSelections);
      return true;
    } catch (error) {
      this.logger.warn(
        `settlement pipeline failed for ${item.settlement.fixtureId} (degraded, queued for retry): ${messageOf(error)}`
      );
      return false;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
