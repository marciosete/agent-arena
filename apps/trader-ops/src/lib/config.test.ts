import { describe, expect, it } from 'vitest';
import { BASE_URLS } from '@arena/contracts';
import { POLL_MS, SERVICE_URLS, STORAGE_KEYS } from './config';

describe('config', () => {
  it('falls back to the contract BASE_URLS when no VITE env overrides are set', () => {
    expect(SERVICE_URLS).toEqual({
      pricing: BASE_URLS.pricing,
      betting: BASE_URLS.betting,
      simulator: BASE_URLS.simulator,
      flags: BASE_URLS.flags,
    });
  });

  it('polls the exposure board at ~3s per the spec', () => {
    expect(POLL_MS.exposure).toBe(3_000);
  });

  it('keeps the flags and simulator admin keys under distinct storage keys', () => {
    expect(STORAGE_KEYS.flagsAdminKey).not.toBe(STORAGE_KEYS.simAdminKey);
  });
});
