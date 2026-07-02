import { teamById, type SimState } from '@arena/contracts';
import type { Logger } from './bot';
import type { ApiResult } from './http';
import { formatLeagueTable, type LeagueRow } from './league';

/** What the runner needs from a bot — Bot implements this. */
export interface RoundPlayer {
  readonly token: string | null;
  playRound(): Promise<void>;
  snapshot(): LeagueRow;
}

/** What the runner needs from the client — ArenaClient implements this. */
export interface SimStateSource {
  getSimState(token: string): Promise<ApiResult<SimState>>;
}

/** The slice of process the SIGINT binding needs — injectable for tests. */
export interface SigintSource {
  once(event: 'SIGINT', listener: () => void): unknown;
}

export interface RunnerOptions {
  intervalMs: number;
  log: Logger;
}

/**
 * The show loop: every interval, each bot plays a round, then the league
 * table prints. Overlapping ticks are skipped rather than queued so a slow
 * upstream never stacks rounds.
 */
export class Runner {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private current: Promise<void> | null = null;
  private round = 0;
  private championAnnounced = false;

  constructor(
    private readonly bots: RoundPlayer[],
    private readonly sim: SimStateSource,
    private readonly options: RunnerOptions
  ) {}

  start(): void {
    const tick = (): void => {
      this.playRound().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.options.log(`💥 round crashed: ${message}`);
      });
    };
    tick();
    this.timer = setInterval(tick, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Stop ticking and wait for any in-flight round to finish printing. */
  async shutdown(): Promise<void> {
    this.stop();
    if (this.current) {
      await this.current.catch(() => undefined);
    }
  }

  leagueTable(): string {
    return formatLeagueTable(this.bots.map((bot) => bot.snapshot()));
  }

  async playRound(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const round = this.runRound();
    this.current = round;
    try {
      await round;
    } finally {
      this.busy = false;
      this.current = null;
    }
  }

  private async runRound(): Promise<void> {
    this.round += 1;
    this.options.log(`\n⚽ Round ${this.round}`);
    for (const bot of this.bots) {
      await bot.playRound();
    }
    await this.announceChampion();
    this.options.log(this.leagueTable());
  }

  /** Poll the (optional) simulator with any provisioned bot's token. */
  private async announceChampion(): Promise<void> {
    if (this.championAnnounced) return;
    const token = this.bots.map((bot) => bot.token).find((candidate) => candidate !== null);
    if (!token) return;
    const state = await this.sim.getSimState(token);
    if (!state.ok || state.data.champion === null) return;
    const champion = teamById(state.data.champion)?.name ?? state.data.champion;
    this.championAnnounced = true;
    this.options.log(`🏆 ${champion} are world champions — the book is settled.`);
  }
}

/**
 * Ctrl-C: stop the loop, let any in-flight round finish so its output lands
 * BEFORE the final table, then print final standings. No process.exit — the
 * drained event loop exits zero on its own.
 */
export function bindSigint(runner: Runner, log: Logger, proc: SigintSource = process): void {
  proc.once('SIGINT', () => {
    log('\n👋 SIGINT — wrapping up…');
    runner
      .shutdown()
      .then(() => {
        log('final standings:');
        log(runner.leagueTable());
      })
      .catch(() => undefined);
  });
}
