import { BASE_URLS } from '@arena/contracts';

/**
 * Service base URLs. Deployed builds (Vercel) inject `VITE_<SERVICE>_URL`;
 * local dev falls back to the contract's localhost ports, so the same build
 * runs in both worlds.
 */
export const SERVICE_URLS = {
  pricing: import.meta.env.VITE_PRICING_URL ?? BASE_URLS.pricing,
  betting: import.meta.env.VITE_BETTING_URL ?? BASE_URLS.betting,
  simulator: import.meta.env.VITE_SIMULATOR_URL ?? BASE_URLS.simulator,
  flags: import.meta.env.VITE_FLAGS_URL ?? BASE_URLS.flags,
} as const;
