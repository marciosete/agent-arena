/**
 * Bot roster entrypoint — agents built by an agent. Four autonomous punters
 * provision their own accounts, study the markets, and bet into the platform
 * on an interval loop until SIGINT.
 */
import { Bot } from './bot';
import { ArenaClient } from './client';
import { loadConfig } from './config';
import { buildRoster } from './roster';
import { bindSigint, Runner } from './runner';

const config = loadConfig();
const log = (line: string): void => console.log(line);

if (!config.adminKey) {
  log('⚠️  BETTING_ADMIN_KEY is not set — account provisioning will be refused (403).');
}

const client = new ArenaClient(config.urls, config.adminKey);
const bots = buildRoster().map((spec) => new Bot(spec, client, log));
const runner = new Runner(bots, client, { intervalMs: config.roundIntervalMs, log });

log(
  `🤖 Agent Arena roster warming up — a round every ${config.roundIntervalMs}ms. Ctrl-C to stop.`
);
bindSigint(runner, log);
runner.start();
