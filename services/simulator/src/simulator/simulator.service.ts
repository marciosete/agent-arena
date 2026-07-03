import { Injectable, Logger } from '@nestjs/common';
import type { SettlementEvent, SimState } from '@arena/contracts';
import { initialSimState, playNextFixture } from './engine';
import { createRng, type Rng } from './rng';
import { DownstreamClient } from './downstream.client';
import { resolveWinningSelections } from './winning-selections';

/**
 * Holds the simulated bracket. In-memory BY DESIGN: the simulation is
 * ephemeral state with a reset button, not a system of record.
 *
 * Set SIM_SEED to make a whole run reproducible; unset, each run differs.
 */
@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private state: SimState = initialSimState();
  private rng: Rng = createRng(this.resolveSeed());
  /** Era of the bracket: bumped on reset so in-flight work goes stale. */
  private generation = 0;
  /** Generation whose /run loop is live; null when idle. */
  private activeRunGeneration: number | null = null;
  /** Serializes plays so settlements reach pricing in bracket order. */
  private playQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly downstream: DownstreamClient) {}

  getState(): SimState {
    return this.state;
  }

  reset(): SimState {
    // Invalidate the era: a live /run loop exits at its next check, and any
    // in-flight or queued play discards itself instead of settling stale
    // results against the fresh tournament.
    this.generation += 1;
    this.activeRunGeneration = null;
    this.rng = createRng(this.resolveSeed());
    this.state = initialSimState();
    return this.state;
  }

  /**
   * THE FINALE CHAIN (integration.md §4): simulate the next unplayed fixture
   * and advance its winner, then fan out — pricing /reprice, resolve the
   * winning selections by team name from ITS response, betting /settle.
   * Downstream failures degrade (log + carry on); they never corrupt the
   * bracket. A no-op returning current state when everything is played.
   *
   * Plays are queued: overlapping calls (a manual /play-next during a paced
   * /run) execute one after another, so pricing never sees a fixture's
   * settlement before the feeder result that determined its teams.
   */
  playNext(): Promise<SimState> {
    const generation = this.generation;
    const play = this.playQueue.then(() => this.playOne(generation));
    this.playQueue = play.catch(() => undefined);
    return play;
  }

  /**
   * Fast-forward to the final, pausing `intervalMs` between fixtures. Responds
   * immediately with the current state; progress is observable via GET /state.
   */
  run(intervalMs: number): SimState {
    if (this.activeRunGeneration === null && this.state.remainingFixtureIds.length > 0) {
      this.activeRunGeneration = this.generation;
      // Fire-and-forget by design: /run responds immediately and the loop's
      // progress is observable via GET /state. runToFinal releases the active
      // slot in its finally, so a crashed loop can be re-run.
      this.runToFinal(intervalMs, this.generation).catch((error) => {
        this.logger.error(`run loop aborted: ${message(error)}`);
      });
    }
    return this.state;
  }

  private async playOne(generation: number): Promise<SimState> {
    if (generation !== this.generation) {
      return this.state; // a reset landed while this play was queued
    }
    const outcome = playNextFixture(this.state, this.rng, new Date().toISOString());
    if (!outcome) {
      return this.state;
    }
    this.state = outcome.state;
    await this.fanOut(outcome.settlement, outcome.isFinal, generation);
    return this.state;
  }

  private async runToFinal(intervalMs: number, generation: number): Promise<void> {
    try {
      while (this.generation === generation && this.state.remainingFixtureIds.length > 0) {
        await this.playNext();
        if (
          this.generation === generation &&
          this.state.remainingFixtureIds.length > 0 &&
          intervalMs > 0
        ) {
          await sleep(intervalMs);
        }
      }
    } finally {
      if (this.activeRunGeneration === generation) {
        this.activeRunGeneration = null;
      }
    }
  }

  private async fanOut(
    settlement: SettlementEvent,
    isFinal: boolean,
    generation: number
  ): Promise<void> {
    let markets;
    try {
      markets = await this.downstream.reprice(settlement);
    } catch (error) {
      this.logger.warn(
        `degraded: pricing /reprice failed for ${settlement.fixtureId}; bets not settled — ${message(error)}`
      );
      return;
    }

    if (generation !== this.generation) {
      this.logger.warn(
        `stale: reset landed while repricing ${settlement.fixtureId}; skipping settle`
      );
      return;
    }

    const winningSelections = resolveWinningSelections(markets, settlement, isFinal);
    if (winningSelections.length === 0) {
      this.logger.warn(
        `degraded: no selection matched the winner's team name for ${settlement.fixtureId}; skipping settle`
      );
      return;
    }

    try {
      await this.downstream.settle(settlement, winningSelections);
    } catch (error) {
      this.logger.warn(
        `degraded: betting /settle failed for ${settlement.fixtureId} — ${message(error)}`
      );
    }
  }

  private resolveSeed(): number {
    const raw = process.env.SIM_SEED;
    if (raw === undefined || raw === '') {
      return Date.now();
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      this.logger.warn(`SIM_SEED "${raw}" is not a number — using a time-based seed instead`);
      return Date.now();
    }
    return parsed;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
