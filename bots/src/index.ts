/**
 * Bot roster entrypoint — `npm run dev -w bots`.
 * Agents built by an agent: four punters provision their own accounts and
 * bet into the platform. Config via env: PRICING_URL, BETTING_URL,
 * SESSION_SECRET, BOTS_ROUND_INTERVAL_MS (see src/config.ts).
 */
import { loadConfig } from './config';
import { runRoster } from './runner';

// Pick up a local .env (bots/.env or the repo root's) without overriding
// anything already set in the environment.
for (const envFile of ['.env', '../.env']) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // optional file — ambient environment wins
  }
}

runRoster({ config: loadConfig() }).catch((error: unknown) => {
  console.error('💥 the roster crashed:', error);
  process.exitCode = 1;
});
