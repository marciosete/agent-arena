import { BASE_URLS } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUND_INTERVAL_MS, loadConfig } from '../config';

describe('loadConfig', () => {
  it('falls back to the contract BASE_URLS when no env is set', () => {
    const config = loadConfig({});
    expect(config.urls).toEqual({
      pricing: BASE_URLS.pricing,
      betting: BASE_URLS.betting,
      simulator: BASE_URLS.simulator,
    });
    expect(config.adminKey).toBe('');
    expect(config.roundIntervalMs).toBe(DEFAULT_ROUND_INTERVAL_MS);
  });

  it('resolves service URLs and the admin key from the environment', () => {
    const config = loadConfig({
      PRICING_URL: 'https://pricing.onrender.com',
      BETTING_URL: 'https://betting.onrender.com',
      SIMULATOR_URL: 'https://simulator.onrender.com',
      BETTING_ADMIN_KEY: 'hunter2',
      BOTS_ROUND_INTERVAL_MS: '5000',
    });
    expect(config.urls).toEqual({
      pricing: 'https://pricing.onrender.com',
      betting: 'https://betting.onrender.com',
      simulator: 'https://simulator.onrender.com',
    });
    expect(config.adminKey).toBe('hunter2');
    expect(config.roundIntervalMs).toBe(5_000);
  });

  it('rejects nonsense intervals in favour of the default', () => {
    expect(loadConfig({ BOTS_ROUND_INTERVAL_MS: 'soon' }).roundIntervalMs).toBe(
      DEFAULT_ROUND_INTERVAL_MS
    );
    expect(loadConfig({ BOTS_ROUND_INTERVAL_MS: '-200' }).roundIntervalMs).toBe(
      DEFAULT_ROUND_INTERVAL_MS
    );
  });
});
