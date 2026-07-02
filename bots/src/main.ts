import { Bot, type Logger } from './bot';
import { ArenaClient } from './client';
import { loadConfig } from './config';
import { buildRoster } from './roster';
import { bindSigint, Runner, type SigintSource } from './runner';

/**
 * Wire and start the roster. Returns the running Runner, or null when
 * mandatory config is missing — the caller should exit non-zero rather than
 * hammer the platform with doomed admin-keyed requests every round.
 */
export function main(env: NodeJS.ProcessEnv, log: Logger, proc: SigintSource): Runner | null {
  const config = loadConfig(env);
  if (!config.adminKey) {
    log('🛑 BETTING_ADMIN_KEY is not set — bots cannot provision accounts. Set it and restart.');
    return null;
  }

  const client = new ArenaClient(config.urls, config.adminKey);
  const bots = buildRoster().map((spec) => new Bot(spec, client, log));
  const runner = new Runner(bots, client, { intervalMs: config.roundIntervalMs, log });

  log(
    `🤖 Agent Arena roster warming up — a round every ${config.roundIntervalMs}ms. Ctrl-C to stop.`
  );
  bindSigint(runner, log, proc);
  runner.start();
  return runner;
}
