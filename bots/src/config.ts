import { BASE_URLS } from '@arena/contracts';

/**
 * Runtime configuration for the roster, resolved from the environment so the
 * same code points at localhost in dev and at the Render services in prod.
 */
export interface BotsConfig {
  /** pricing service base URL — markets live here */
  pricingUrl: string;
  /** betting service base URL — accounts + bets */
  bettingUrl: string;
  /** BETTING_ADMIN_KEY — unlocks bot provisioning (POST /accounts) */
  adminKey: string;
  /** pause between betting rounds */
  roundIntervalMs: number;
}

export const DEFAULT_ROUND_INTERVAL_MS = 10_000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotsConfig {
  const interval = Number(env.BOTS_ROUND_INTERVAL_MS);
  return {
    pricingUrl: env.PRICING_URL ?? BASE_URLS.pricing,
    bettingUrl: env.BETTING_URL ?? BASE_URLS.betting,
    adminKey: env.BETTING_ADMIN_KEY ?? '',
    roundIntervalMs:
      Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_ROUND_INTERVAL_MS,
  };
}
