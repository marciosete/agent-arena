import { BASE_URLS } from '@arena/contracts';

type ServiceKey = keyof typeof BASE_URLS;

/** Local defaults from the contracts; deployed builds override via Vercel env. */
export const SERVICE_URLS: Record<ServiceKey, string> = {
  pricing: import.meta.env.VITE_PRICING_URL ?? BASE_URLS.pricing,
  betting: import.meta.env.VITE_BETTING_URL ?? BASE_URLS.betting,
  simulator: import.meta.env.VITE_SIMULATOR_URL ?? BASE_URLS.simulator,
  flags: import.meta.env.VITE_FLAGS_URL ?? BASE_URLS.flags,
};

/** Poll cadence per board — traders want exposure hot, flags can breathe. */
export const POLL_MS = {
  exposure: 3_000,
  accounts: 5_000,
  markets: 3_000,
  state: 3_000,
  flags: 5_000,
} as const;

/** Admin keys are prompted for once and kept here — never baked into the bundle. */
export const STORAGE_KEYS = {
  flagsAdminKey: 'trader.flags-admin-key',
  simAdminKey: 'trader.sim-admin-key',
} as const;
