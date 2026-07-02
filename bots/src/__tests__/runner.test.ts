import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueRow } from '../league';
import { bindSigint, Runner, type RoundPlayer, type SimStateSource } from '../runner';

interface FakePlayer extends RoundPlayer {
  rounds: number;
}

function fakePlayer(name: string, token: string | null = 'tok'): FakePlayer {
  const snapshot: LeagueRow = {
    emoji: '🤖',
    name,
    provisioned: true,
    balance: 10_000,
    openBets: 0,
    pnl: 0,
  };
  return {
    token,
    rounds: 0,
    async playRound() {
      this.rounds += 1;
    },
    snapshot: () => snapshot,
  };
}

const idleSim: SimStateSource = {
  getSimState: vi.fn().mockResolvedValue({
    ok: true,
    data: { fixtures: [], champion: null, playedFixtureIds: [], remainingFixtureIds: [] },
  }),
};

function makeRunner(players: RoundPlayer[], sim: SimStateSource = idleSim, intervalMs = 1_000) {
  const logs: string[] = [];
  const runner = new Runner(players, sim, { intervalMs, log: (line) => logs.push(line) });
  return { runner, logs };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Runner', () => {
  it('prints a league table after each round', async () => {
    const { runner, logs } = makeRunner([fakePlayer('Sharp'), fakePlayer('Mug')]);
    await runner.playRound();
    expect(logs.some((line) => line.includes('Round 1'))).toBe(true);
    const table = logs.find((line) => line.includes('League table'));
    expect(table).toBeDefined();
    expect(table).toContain('Sharp');
    expect(table).toContain('Mug');
  });

  it('plays every bot each interval tick', async () => {
    const players = [fakePlayer('Sharp'), fakePlayer('Steady')];
    const { runner } = makeRunner(players);
    runner.start();
    await vi.advanceTimersByTimeAsync(2_000); // initial round + two ticks
    runner.stop();
    expect(players[0].rounds).toBe(3);
    expect(players[1].rounds).toBe(3);
  });

  it('exits cleanly on SIGINT: stops the loop and prints final standings', async () => {
    const players = [fakePlayer('Sharp')];
    const { runner, logs } = makeRunner(players);
    const proc = new EventEmitter();

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    bindSigint(runner, (line) => logs.push(line), proc);
    proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(0); // let shutdown drain

    const roundsAtSigint = players[0].rounds;
    await vi.advanceTimersByTimeAsync(5_000); // loop is stopped — no further rounds
    expect(players[0].rounds).toBe(roundsAtSigint);
    expect(logs.some((line) => line.includes('final standings'))).toBe(true);
    expect(logs.filter((line) => line.includes('League table')).length).toBeGreaterThanOrEqual(2);
  });

  it('lets an in-flight round finish before printing final standings', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: RoundPlayer = {
      token: null,
      playRound: () => gate,
      snapshot: () => ({
        emoji: '🐢',
        name: 'Slow',
        provisioned: true,
        balance: 0,
        openBets: 0,
        pnl: 0,
      }),
    };
    const { runner, logs } = makeRunner([slow]);
    const proc = new EventEmitter();

    const inFlight = runner.playRound();
    bindSigint(runner, (line) => logs.push(line), proc);
    proc.emit('SIGINT'); // arrives mid-round
    release();
    await inFlight;
    await vi.advanceTimersByTimeAsync(0);

    const roundTable = logs.findIndex((line) => line.includes('League table'));
    const finalMarker = logs.findIndex((line) => line.includes('final standings'));
    expect(roundTable).toBeGreaterThanOrEqual(0);
    expect(finalMarker).toBeGreaterThan(roundTable); // final table prints LAST
  });

  it('skips a tick while the previous round is still in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let rounds = 0;
    const slow: RoundPlayer = {
      token: null,
      playRound: async () => {
        rounds += 1;
        await gate;
      },
      snapshot: () => ({
        emoji: '🐢',
        name: 'Slow',
        provisioned: true,
        balance: 0,
        openBets: 0,
        pnl: 0,
      }),
    };
    const { runner } = makeRunner([slow]);
    const first = runner.playRound();
    const second = runner.playRound(); // overlaps — must be skipped
    release();
    await Promise.all([first, second]);
    expect(rounds).toBe(1);
  });

  it('announces the champion once, using the first provisioned bot token', async () => {
    const sim: SimStateSource = {
      getSimState: vi.fn().mockResolvedValue({
        ok: true,
        data: { fixtures: [], champion: 'FRA', playedFixtureIds: [], remainingFixtureIds: [] },
      }),
    };
    const { runner, logs } = makeRunner(
      [fakePlayer('Sharp', null), fakePlayer('Mug', 'mug-token')],
      sim
    );
    await runner.playRound();
    await runner.playRound();
    expect(sim.getSimState).toHaveBeenCalledWith('mug-token');
    expect(logs.filter((line) => line.includes('France are world champions'))).toHaveLength(1);
  });

  it('logs a crashed round instead of dying', async () => {
    const explosive: RoundPlayer = {
      token: null,
      playRound: async () => {
        throw new Error('kaboom');
      },
      snapshot: () => ({
        emoji: '💣',
        name: 'Boom',
        provisioned: true,
        balance: 0,
        openBets: 0,
        pnl: 0,
      }),
    };
    const { runner, logs } = makeRunner([explosive]);
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    runner.stop();
    expect(logs.some((line) => line.includes('round crashed: kaboom'))).toBe(true);
  });

  it('stays quiet when no bot has a token or the simulator is absent', async () => {
    const downSim: SimStateSource = {
      getSimState: vi.fn().mockResolvedValue({ ok: false, kind: 'network', message: 'down' }),
    };
    const noToken = makeRunner([fakePlayer('Sharp', null)], downSim);
    await noToken.runner.playRound();
    expect(downSim.getSimState).not.toHaveBeenCalled();

    const simDown = makeRunner([fakePlayer('Sharp')], downSim);
    await expect(simDown.runner.playRound()).resolves.toBeUndefined();
    expect(simDown.logs.some((line) => line.includes('champions'))).toBe(false);
  });
});
