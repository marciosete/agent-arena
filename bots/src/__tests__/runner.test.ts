import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotClient } from '../http';
import { ROSTER } from '../roster';
import { cryptoRng, runRoster } from '../runner';
import type { BotsConfig } from '../config';
import {
  FIXED_UUID,
  accountFixture,
  authResponseFixture,
  betFixture,
  marketFixture,
} from './fixtures';

function testConfig(overrides: Partial<BotsConfig> = {}): BotsConfig {
  return {
    pricingUrl: 'http://127.0.0.1:1',
    bettingUrl: 'http://127.0.0.1:1',
    sessionSecret: 'the-session-secret',
    roundIntervalMs: 5,
    ...overrides,
  };
}

function happyClient(overrides: Partial<BotClient> = {}): BotClient {
  return {
    provisionBot: async () => ({ ok: true, data: authResponseFixture() }),
    getMarkets: async () => ({ ok: true, data: [marketFixture()] }),
    getAccount: async () => ({ ok: true, data: accountFixture() }),
    getBets: async () => ({ ok: true, data: [] }),
    placeBet: async () => ({ ok: true, data: betFixture() }),
    ...overrides,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('timed out waiting for the runner');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runRoster', () => {
  it('plays rounds, prints a league table with the full roster, and exits cleanly on SIGINT', async () => {
    const logs: string[] = [];
    const signals = new EventEmitter();

    const done = runRoster({
      config: testConfig({ roundIntervalMs: 50 }),
      client: happyClient(),
      log: (line) => logs.push(line),
      rng: () => 0,
      uuid: () => FIXED_UUID,
      signals,
      roster: ROSTER,
    });

    await waitFor(() => logs.some((line) => line.includes('League table')));
    await sleep(10); // let the runner settle into its between-rounds pause
    signals.emit('SIGINT');
    await done; // resolving at all IS the clean exit

    const output = logs.join('\n');
    expect(output).toContain('🏆 League table');
    for (const bot of ROSTER) {
      expect(output).toContain(bot.name);
    }
    expect(output).toContain('👋 SIGINT');
  });

  it('stops after the current round when SIGINT arrives mid-round', async () => {
    const logs: string[] = [];
    const signals = new EventEmitter();
    const client = happyClient({
      getMarkets: async () => {
        signals.emit('SIGINT');
        return { ok: true, data: [marketFixture()] };
      },
    });

    await runRoster({
      config: testConfig(),
      client,
      log: (line) => logs.push(line),
      rng: () => 0,
      uuid: () => FIXED_UUID,
      signals,
      roster: [{ name: 'Loner', emoji: '🤖', tagline: 'here briefly', strategy: () => [] }],
    });

    const output = logs.join('\n');
    expect(output).toContain('── round 1 ──');
    expect(output).not.toContain('── round 2 ──');
  });

  it('retries provisioning every round until betting comes online', async () => {
    const logs: string[] = [];
    const signals = new EventEmitter();
    let attempts = 0;
    const client = happyClient({
      provisionBot: async () => {
        attempts += 1;
        return attempts <= 2
          ? { ok: false, kind: 'network', detail: 'ECONNREFUSED' }
          : { ok: true, data: authResponseFixture() };
      },
    });

    const done = runRoster({
      config: testConfig(),
      client,
      log: (line) => logs.push(line),
      rng: () => 0,
      uuid: () => FIXED_UUID,
      signals,
      roster: [{ name: 'Latecomer', emoji: '⏰', tagline: 'worth the wait', strategy: () => [] }],
    });

    await waitFor(() => logs.some((line) => line.includes('League table')));
    signals.emit('SIGINT');
    await done;

    const output = logs.join('\n');
    expect(output).toContain('retrying next round');
    expect(output).toContain('no bots seated yet');
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it('drops the seat and re-provisions after a 401 session expiry', async () => {
    const logs: string[] = [];
    const signals = new EventEmitter();
    let provisions = 0;
    const expired = { ok: false, kind: 'http', status: 401, detail: 'HTTP 401' } as const;
    const client = happyClient({
      provisionBot: async () => {
        provisions += 1;
        return { ok: true, data: authResponseFixture() };
      },
      getAccount: async () => expired,
      getBets: async () => expired,
      getMarkets: async () => expired,
    });

    const done = runRoster({
      config: testConfig(),
      client,
      log: (line) => logs.push(line),
      rng: () => 0,
      uuid: () => FIXED_UUID,
      signals,
      roster: [{ name: 'Expiree', emoji: '⌛', tagline: 'time waits', strategy: () => [] }],
    });

    await waitFor(() => provisions >= 2);
    signals.emit('SIGINT');
    await done;

    expect(logs.join('\n')).toContain('will re-provision next round');
  });

  it('warns loudly at startup when SESSION_SECRET is missing', async () => {
    const logs: string[] = [];
    const signals = new EventEmitter();

    const done = runRoster({
      config: testConfig({ sessionSecret: '' }),
      client: happyClient(),
      log: (line) => logs.push(line),
      rng: () => 0,
      uuid: () => FIXED_UUID,
      signals,
      roster: [{ name: 'Keyless', emoji: '🔓', tagline: 'locked out', strategy: () => [] }],
    });

    await waitFor(() => logs.some((line) => line.includes('SESSION_SECRET')));
    signals.emit('SIGINT');
    await done;

    const warning = logs.find((line) => line.includes('SESSION_SECRET'));
    expect(warning).toContain('not set');
  });

  it('runs on its default wiring (real client, crypto rng) against services that are down', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const signals = new EventEmitter();

    const done = runRoster({ config: testConfig(), signals });

    await waitFor(() =>
      logSpy.mock.calls.some((call) => String(call[0]).includes('no bots seated yet'))
    );
    signals.emit('SIGINT');
    await expect(done).resolves.toBeUndefined();
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('👋 SIGINT'))).toBe(true);
  });
});

describe('cryptoRng', () => {
  it('stays uniform in [0, 1)', () => {
    for (let i = 0; i < 1_000; i += 1) {
      const value = cryptoRng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
