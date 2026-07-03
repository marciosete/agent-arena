import { BASE_URLS } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUND_INTERVAL_MS, loadConfig } from '../config';

describe('loadConfig', () => {
  it('falls back to the contract BASE_URLS and defaults when the env is empty', () => {
    const config = loadConfig({});
    expect(config.pricingUrl).toBe(BASE_URLS.pricing);
    expect(config.bettingUrl).toBe(BASE_URLS.betting);
    expect(config.adminKey).toBe('');
    expect(config.roundIntervalMs).toBe(DEFAULT_ROUND_INTERVAL_MS);
  });

  it('prefers PRICING_URL / BETTING_URL / BETTING_ADMIN_KEY from the environment', () => {
    const config = loadConfig({
      PRICING_URL: 'https://pricing.onrender.com',
      BETTING_URL: 'https://betting.onrender.com',
      BETTING_ADMIN_KEY: 'the-admin-key',
    });
    expect(config.pricingUrl).toBe('https://pricing.onrender.com');
    expect(config.bettingUrl).toBe('https://betting.onrender.com');
    expect(config.adminKey).toBe('the-admin-key');
  });

  it('reads the round interval from BOTS_ROUND_INTERVAL_MS', () => {
    expect(loadConfig({ BOTS_ROUND_INTERVAL_MS: '2500' }).roundIntervalMs).toBe(2500);
  });

  it.each(['abc', '0', '-5', ''])(
    'ignores a non-positive or non-numeric interval (%j)',
    (value) => {
      expect(loadConfig({ BOTS_ROUND_INTERVAL_MS: value }).roundIntervalMs).toBe(
        DEFAULT_ROUND_INTERVAL_MS
      );
    }
  );
});
