import { BASE_URLS } from '@arena/contracts';

/** Where each upstream service lives. Env-overridable so the roster can point at Render. */
export interface ServiceUrls {
  pricing: string;
  betting: string;
  simulator: string;
}

export interface BotsConfig {
  urls: ServiceUrls;
  /** BETTING_ADMIN_KEY — required to provision bot accounts. */
  adminKey: string;
  roundIntervalMs: number;
}

export const DEFAULT_ROUND_INTERVAL_MS = 10_000;

/** Bots are Node, not Vite: service bases come from process.env with contract defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotsConfig {
  const interval = Number(env.BOTS_ROUND_INTERVAL_MS ?? DEFAULT_ROUND_INTERVAL_MS);
  return {
    urls: {
      pricing: env.PRICING_URL ?? BASE_URLS.pricing,
      betting: env.BETTING_URL ?? BASE_URLS.betting,
      simulator: env.SIMULATOR_URL ?? BASE_URLS.simulator,
    },
    adminKey: env.BETTING_ADMIN_KEY ?? '',
    roundIntervalMs:
      Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_ROUND_INTERVAL_MS,
  };
}
