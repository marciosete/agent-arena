import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_URLS,
  FIXTURES,
  RepriceRequestSchema,
  SettleRequestSchema,
  SettlementEventSchema,
  SimStateSchema,
  TEAMS,
  teamById,
  type Market,
  type SettlementEvent,
  type SimState,
} from '@arena/contracts';
import { DownstreamClient } from './downstream.client';
import { SimulatorService } from './simulator.service';
import { FakeDownstream, SETTLE_OK } from './testing/fake-downstream';
import { jsonResponse } from './testing/http';
import { matchWinnerMarket, outrightMarket } from './testing/markets';

function makeService(): { service: SimulatorService; downstream: FakeDownstream } {
  // The provider closure runs only after construction, so the forward
  // reference to `service` is safe.
  const downstream: FakeDownstream = new FakeDownstream((): SimState => service.getState());
  const service: SimulatorService = new SimulatorService(downstream as unknown as DownstreamClient);
  return { service, downstream };
}

async function playAll(service: SimulatorService): Promise<SimState> {
  let state = service.getState();
  for (let i = 0; i < FIXTURES.length; i += 1) {
    state = await service.playNext();
  }
  return state;
}

describe('SimulatorService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.SIM_SEED;
  });

  it('starts from the real-world bracket with every fixture unplayed', () => {
    const state = SimStateSchema.parse(makeService().service.getState());
    expect(state.champion).toBeNull();
    expect(state.playedFixtureIds).toEqual([]);
    expect(state.remainingFixtureIds).toHaveLength(FIXTURES.length);
  });

  it('returns to the initial state on reset', async () => {
    const { service } = makeService();
    await service.playNext();
    const state = SimStateSchema.parse(service.reset());
    expect(state.playedFixtureIds).toEqual([]);
    expect(state.remainingFixtureIds).toHaveLength(FIXTURES.length);
  });

  describe('playNext — the finale chain', () => {
    it('plays the next fixture, then calls pricing /reprice BEFORE betting /settle', async () => {
      const { service, downstream } = makeService();
      const state = await service.playNext();

      expect(state.playedFixtureIds).toEqual(['R32-9']);
      expect(downstream.callOrder).toEqual(['reprice', 'settle']);
      const settlement = SettlementEventSchema.parse(downstream.repriceCalls[0]);
      expect(settlement.fixtureId).toBe('R32-9');
      expect(downstream.settleCalls[0]?.settlement).toEqual(settlement);
    });

    it('resolves winningSelections by team name from the markets pricing returned', async () => {
      const { service, downstream } = makeService();
      await service.playNext();

      const settlement = downstream.repriceCalls[0] as SettlementEvent;
      const markets = downstream.marketsReturned[0] as Market[];
      const winnerName = teamById(settlement.winnerTeamId)?.name;
      const expected = markets
        .find((m) => m.fixtureId === settlement.fixtureId)
        ?.selections.find((s) => s.name === winnerName);

      expect(downstream.settleCalls[0]?.winningSelections).toEqual([
        { marketId: settlement.fixtureId, selectionId: expected?.id },
      ]);
    });

    it('is a no-op returning current state once the tournament is complete', async () => {
      const { service, downstream } = makeService();
      const finished = await playAll(service);
      expect(finished.remainingFixtureIds).toEqual([]);
      const repriceCount = downstream.repriceCalls.length;

      const after = await service.playNext();

      expect(after).toEqual(finished);
      expect(downstream.repriceCalls).toHaveLength(repriceCount);
    });

    it('crowns a champion and ALSO settles the OUTRIGHT when the final is played', async () => {
      const { service, downstream } = makeService();
      const state = await playAll(service);

      expect(downstream.repriceCalls).toHaveLength(FIXTURES.length);
      const finalSettle = downstream.settleCalls.at(-1);
      expect(finalSettle?.settlement.fixtureId).toBe('F-1');
      expect(state.champion).toBe(finalSettle?.settlement.winnerTeamId);

      const championName = teamById(state.champion ?? '')?.name;
      const finalMarkets = downstream.marketsReturned.at(-1) as Market[];
      const outright = finalMarkets.find((m) => m.type === 'OUTRIGHT');
      const championSelection = outright?.selections.find((s) => s.name === championName);
      expect(finalSettle?.winningSelections).toEqual([
        expect.objectContaining({ marketId: 'F-1' }),
        { marketId: 'outright', selectionId: championSelection?.id },
      ]);
    });

    it('still advances the bracket when pricing is down (degraded, no settle)', async () => {
      const { service, downstream } = makeService();
      downstream.failReprice = true;

      const state = await service.playNext();

      expect(state.playedFixtureIds).toEqual(['R32-9']);
      expect(state.fixtures.find((f) => f.id === 'R32-9')?.status).toBe('finished');
      expect(downstream.settleCalls).toEqual([]);
    });

    it('still advances the bracket when betting is down (degraded)', async () => {
      const { service, downstream } = makeService();
      downstream.failSettle = true;

      const state = await service.playNext();

      expect(state.playedFixtureIds).toEqual(['R32-9']);
      expect(downstream.callOrder).toEqual(['reprice', 'settle']);
      // ...and the next fixture still plays normally afterwards.
      downstream.failSettle = false;
      const next = await service.playNext();
      expect(next.playedFixtureIds).toEqual(['R32-9', 'R32-10']);
    });

    it('serializes overlapping calls so settlements reach pricing in bracket order', async () => {
      const { service, downstream } = makeService();

      const [, second] = await Promise.all([service.playNext(), service.playNext()]);

      // Never reprice,reprice,…: the second play waits out the first fan-out.
      expect(downstream.callOrder).toEqual(['reprice', 'settle', 'reprice', 'settle']);
      expect(downstream.repriceCalls.map((s) => s.fixtureId)).toEqual(['R32-9', 'R32-10']);
      expect(second.playedFixtureIds).toEqual(['R32-9', 'R32-10']);
    });

    it('discards an in-flight settlement when reset lands mid-reprice', async () => {
      const { service, downstream } = makeService();
      let release = (): void => undefined;
      downstream.repriceGate = new Promise((resolve) => {
        release = resolve;
      });

      const pending = service.playNext();
      // Let the play start and stall inside /reprice before resetting.
      await vi.waitFor(() => {
        expect(downstream.repriceCalls).toHaveLength(1);
      });
      service.reset();
      release();
      await pending;

      // The stale result was repriced but never settled against the fresh bracket…
      expect(downstream.repriceCalls.map((s) => s.fixtureId)).toEqual(['R32-9']);
      expect(downstream.settleCalls).toEqual([]);
      // …and the fresh bracket is untouched.
      expect(service.getState().playedFixtureIds).toEqual([]);
    });

    it('drops a queued play when a reset lands before it dequeues', async () => {
      const { service, downstream } = makeService();
      let release = (): void => undefined;
      downstream.repriceGate = new Promise((resolve) => {
        release = resolve;
      });

      const first = service.playNext();
      await vi.waitFor(() => {
        expect(downstream.repriceCalls).toHaveLength(1);
      });
      const queued = service.playNext();
      service.reset();
      release();
      await Promise.all([first, queued]);

      expect(downstream.repriceCalls.map((s) => s.fixtureId)).toEqual(['R32-9']);
      expect(downstream.settleCalls).toEqual([]);
      expect(service.getState().playedFixtureIds).toEqual([]);
    });

    it('skips settle when no selection matches the winner by name', async () => {
      const { service, downstream } = makeService();
      downstream.reprice = (settlement: SettlementEvent) => {
        downstream.callOrder.push('reprice');
        downstream.repriceCalls.push(settlement);
        // A market for the right fixture but with unrelated teams: the join finds no name.
        return Promise.resolve([matchWinnerMarket(settlement.fixtureId, 'AUS', 'EGY')]);
      };

      const state = await service.playNext();

      expect(state.playedFixtureIds).toEqual(['R32-9']);
      expect(downstream.settleCalls).toEqual([]);
    });
  });

  describe('run — fast-forward to the final', () => {
    it('responds immediately and plays everything out asynchronously', async () => {
      const { service, downstream } = makeService();
      const snapshot = service.run(0);

      expect(snapshot.champion).toBeNull(); // returned before the tournament resolved
      await vi.waitFor(() => {
        expect(service.getState().champion).not.toBeNull();
      });
      expect(service.getState().remainingFixtureIds).toEqual([]);
      expect(downstream.repriceCalls).toHaveLength(FIXTURES.length);
    });

    it('ignores a second run while one is in flight (no double-playing)', async () => {
      const { service, downstream } = makeService();
      service.run(0);
      service.run(0);

      await vi.waitFor(() => {
        expect(service.getState().remainingFixtureIds).toEqual([]);
      });
      expect(downstream.repriceCalls).toHaveLength(FIXTURES.length);
    });

    it('paces fixtures by intervalMs', async () => {
      vi.useFakeTimers();
      const { service, downstream } = makeService();
      service.run(1_000);

      await vi.advanceTimersByTimeAsync(0);
      expect(downstream.repriceCalls).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(downstream.repriceCalls).toHaveLength(2);
    });

    it('stops an in-flight run on reset and leaves the fresh bracket untouched', async () => {
      vi.useFakeTimers();
      const { service, downstream } = makeService();
      service.run(1_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(downstream.repriceCalls).toHaveLength(1);

      service.reset();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(downstream.repriceCalls).toHaveLength(1);
      expect(service.getState().playedFixtureIds).toEqual([]);
      expect(service.getState().remainingFixtureIds).toHaveLength(FIXTURES.length);
    });

    it('logs and recovers when the run loop itself crashes', async () => {
      const { service, downstream } = makeService();
      const crash = vi.spyOn(service, 'playNext').mockRejectedValueOnce(new Error('boom'));

      service.run(0);
      await vi.waitFor(() => {
        expect(crash).toHaveBeenCalled();
      });
      crash.mockRestore();

      // The crashed loop released its lock, so a fresh run completes normally.
      service.run(0);
      await vi.waitFor(() => {
        expect(service.getState().champion).not.toBeNull();
      });
      expect(downstream.repriceCalls).toHaveLength(FIXTURES.length);
    });

    it('does nothing when the tournament is already complete', async () => {
      const { service, downstream } = makeService();
      await playAll(service);

      const state = service.run(0);
      await vi.waitFor(() => {
        expect(downstream.repriceCalls).toHaveLength(FIXTURES.length);
      });
      expect(state.remainingFixtureIds).toEqual([]);
    });
  });

  describe('determinism', () => {
    it('warns and falls back to a time-based seed when SIM_SEED is not numeric', () => {
      process.env.SIM_SEED = 'demo-day';
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const { service } = makeService();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('SIM_SEED'));
      expect(service.getState().remainingFixtureIds).toHaveLength(FIXTURES.length);
      warn.mockRestore();
    });

    it('replays the identical tournament under a fixed SIM_SEED across resets', async () => {
      process.env.SIM_SEED = '20260703';
      const { service } = makeService();

      const first = await playAll(service);
      service.reset();
      const second = await playAll(service);

      expect(second.champion).toBe(first.champion);
      expect(second.fixtures).toEqual(first.fixtures);
    });
  });

  describe('through the real DownstreamClient (mocked fetch)', () => {
    it('POSTs pricing /reprice then betting /settle with the §3 join resolved from the response', async () => {
      const urls: string[] = [];
      const fetchMock = vi.fn((url: string, init: RequestInit) => {
        urls.push(String(url));
        if (String(url).endsWith('/reprice')) {
          const request = RepriceRequestSchema.parse(JSON.parse(String(init.body)));
          expect(request.settlement.fixtureId).toBe('R32-9');
          return Promise.resolve(
            jsonResponse([
              matchWinnerMarket('R32-9', 'POR', 'CRO'),
              outrightMarket(TEAMS.map((team) => team.id)),
            ])
          );
        }
        return Promise.resolve(jsonResponse(SETTLE_OK));
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new SimulatorService(new DownstreamClient());
      const state = await service.playNext();

      expect(urls).toEqual([`${BASE_URLS.pricing}/reprice`, `${BASE_URLS.betting}/settle`]);
      expect(state.playedFixtureIds).toEqual(['R32-9']);

      const [, settleInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const settleRequest = SettleRequestSchema.parse(JSON.parse(String(settleInit.body)));
      expect(settleRequest.winningSelections).toHaveLength(1);
      expect(settleRequest.winningSelections[0]?.selectionId).toMatch(/^px-sel-/);
    });

    it('survives both services being unreachable (fetch rejects)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const service = new SimulatorService(new DownstreamClient());
      const state = await service.playNext();

      expect(state.playedFixtureIds).toEqual(['R32-9']);
      expect(state.fixtures.find((f) => f.id === 'R32-9')?.winnerTeamId).not.toBeNull();
    });
  });
});
