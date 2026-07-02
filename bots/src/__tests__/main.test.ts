import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../main';

const ENV = { BETTING_ADMIN_KEY: 'test-key', BOTS_ROUND_INTERVAL_MS: '1000' };

function run(env: NodeJS.ProcessEnv, proc = new EventEmitter()) {
  const logs: string[] = [];
  const runner = main(env, (line) => logs.push(line), proc);
  return { runner, logs, proc };
}

beforeEach(() => {
  vi.useFakeTimers();
  // No platform up: every call fails fast, the roster degrades gracefully.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }))
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('main', () => {
  it('refuses to start without BETTING_ADMIN_KEY (fail fast, exit non-zero)', () => {
    const { runner, logs } = run({});
    expect(runner).toBeNull();
    expect(logs.some((line) => line.includes('BETTING_ADMIN_KEY'))).toBe(true);
    expect(logs.some((line) => line.includes('Round'))).toBe(false); // never started
  });

  it('starts the round loop with the configured cadence', async () => {
    const { runner, logs } = run(ENV);
    expect(runner).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(logs.some((line) => line.includes('a round every 1000ms'))).toBe(true);
    expect(logs.some((line) => line.includes('Round 1'))).toBe(true);
    expect(logs.some((line) => line.includes('League table'))).toBe(true);
    runner!.stop();
  });

  it('wires SIGINT to a clean shutdown with final standings', async () => {
    const { runner, logs, proc } = run(ENV);
    await vi.advanceTimersByTimeAsync(0); // round 1 plays out
    proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(0); // shutdown drains

    expect(logs.some((line) => line.includes('final standings'))).toBe(true);
    const roundsBefore = logs.filter((line) => line.includes('⚽')).length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(logs.filter((line) => line.includes('⚽')).length).toBe(roundsBefore); // loop stopped
    expect(runner).not.toBeNull();
  });
});
