import { BASE_URLS } from '@arena/contracts';

export type ServiceKey = keyof typeof BASE_URLS;

/** Local defaults from the contracts; deployed builds override via Vercel env. */
export const SERVICE_URLS: Record<ServiceKey, string> = {
  pricing: import.meta.env.VITE_PRICING_URL ?? BASE_URLS.pricing,
  betting: import.meta.env.VITE_BETTING_URL ?? BASE_URLS.betting,
  simulator: import.meta.env.VITE_SIMULATOR_URL ?? BASE_URLS.simulator,
  flags: import.meta.env.VITE_FLAGS_URL ?? BASE_URLS.flags,
};

/** Poll cadences (ms). Flags reveal features live; state drives the bracket cascade. */
export const POLL = {
  flags: 3_000,
  markets: 5_000,
  state: 1_500,
  bets: 4_000,
  health: 5_000,
  balance: 5_000,
} as const;
