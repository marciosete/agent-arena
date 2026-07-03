import { randomInt } from 'node:crypto';
import {
  defaultUuid,
  provisionBot,
  runRound,
  type Bot,
  type BotDeps,
  type Logger,
  type Personality,
} from './bot';
import type { BotsConfig } from './config';
import { ArenaClient, type BotClient } from './http';
import { ROSTER } from './roster';
import { renderLeagueTable, type StandingRow } from './table';

/**
 * The runner: seats the roster, plays a round every interval, prints the
 * league table after each one, and leaves cleanly on SIGINT. Bots that can't
 * provision yet (betting still coming online) are retried every round.
 */

export interface SignalSource {
  once(event: 'SIGINT', listener: () => void): unknown;
}

export interface RunnerOptions {
  config: BotsConfig;
  roster?: Personality[];
  client?: BotClient;
  log?: Logger;
  rng?: () => number;
  uuid?: () => string;
  signals?: SignalSource;
}

interface Seat {
  personality: Personality;
  bot: Bot | null;
}

const RNG_RANGE = 2 ** 48 - 1;

/** Uniform [0, 1) off node:crypto — keeps the linter's pseudo-random rule quiet too. */
export const cryptoRng = (): number => randomInt(0, RNG_RANGE) / RNG_RANGE;

async function playRound(deps: BotDeps, seats: Seat[], round: number): Promise<void> {
  deps.log(`\n── round ${round} ──`);
  const rows: StandingRow[] = [];
  for (const seat of seats) {
    seat.bot ??= await provisionBot(deps, seat.personality);
    if (!seat.bot) {
      continue;
    }
    const outcome = await runRound(deps, seat.bot);
    if (outcome.sessionExpired) {
      // Tokens expire (12h TTL); the only re-auth path a bot has is a fresh
      // provisioning, so drop the seat and let the next round re-provision.
      seat.bot = null;
    }
    rows.push({
      emoji: seat.personality.emoji,
      name: seat.personality.name,
      balance: outcome.balance,
      openBets: outcome.openBets,
    });
  }
  if (rows.length > 0) {
    deps.log(renderLeagueTable(rows));
  } else {
    deps.log('no bots seated yet (is betting up?) — retrying next round');
  }
}

/** Resolves when SIGINT arrives — the process then exits on its own, cleanly. */
export async function runRoster(options: RunnerOptions): Promise<void> {
  const { config } = options;
  const log = options.log ?? console.log;
  const deps: BotDeps = {
    client: options.client ?? new ArenaClient(config),
    log,
    rng: options.rng ?? cryptoRng,
    uuid: options.uuid ?? defaultUuid,
  };
  const seats: Seat[] = (options.roster ?? ROSTER).map((personality) => ({
    personality,
    bot: null,
  }));

  let stopped = false;
  let cancelPause: (() => void) | undefined;
  (options.signals ?? process).once('SIGINT', () => {
    stopped = true;
    log('\n👋 SIGINT — the bots settle their tabs and leave the arena.');
    cancelPause?.();
  });

  log(
    `🤖 Agent Arena roster warming up: ${seats.length} bots, a round every ${config.roundIntervalMs / 1000}s. Ctrl-C to stop.`
  );
  if (config.adminKey === '') {
    log(
      '⚠️  BETTING_ADMIN_KEY is not set — betting will refuse to provision bots (401/403). Set it in the environment before expecting any bets.'
    );
  }

  let round = 0;
  while (!stopped) {
    round += 1;
    await playRound(deps, seats, round);
    if (stopped) {
      break;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, config.roundIntervalMs);
      cancelPause = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    cancelPause = undefined;
  }
}
