import { BASE_URLS } from '@arena/contracts';

/**
 * Local defaults from the contracts; deployed builds override via Vercel env.
 * `||` (not `??`): an env var set to the empty string must also fall back.
 */
export const SERVICE_URLS = {
  pricing: import.meta.env.VITE_PRICING_URL || BASE_URLS.pricing,
  betting: import.meta.env.VITE_BETTING_URL || BASE_URLS.betting,
  simulator: import.meta.env.VITE_SIMULATOR_URL || BASE_URLS.simulator,
  flags: import.meta.env.VITE_FLAGS_URL || BASE_URLS.flags,
} as const;

export type ServiceKey = keyof typeof SERVICE_URLS;

export const SERVICES = Object.keys(SERVICE_URLS) as ServiceKey[];

/** Polling cadences (ms). The sim state runs hot so results cascade live. */
export const POLL_MS = {
  flags: 3_000,
  state: 1_000,
  markets: 5_000,
  bets: 3_000,
  balance: 5_000,
  health: 5_000,
} as const;
