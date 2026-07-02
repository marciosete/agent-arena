import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURES,
  SimStateSchema,
  teamById,
  type Fixture,
  type Market,
  type SettlementEvent,
} from '@arena/contracts';
import type { DownstreamClient } from './downstream.client';
import { SimulatorService } from './simulator.service';

const OPENER = 'R32-9'; // Portugal v Croatia, earliest unplayed kickoff
const OPENER_FEEDS = 'R16-5';

interface DownstreamMock {
  reprice: ReturnType<typeof vi.fn>;
  settle: ReturnType<typeof vi.fn>;
}

function fixtureIn(fixtures: Fixture[], id: string): Fixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`no fixture ${id}`);
  }
  return fixture;
}

/**
 * A pricing-shaped /reprice response for the just-settled fixture: the settled
 * MATCH_WINNER market (selections named by team name, ids opaque — pricing owns
 * them) plus the repriced OUTRIGHT.
 */
function repriceResponseFor(service: SimulatorService, settlement: SettlementEvent): Market[] {
  const fixture = fixtureIn(service.getState().fixtures, settlement.fixtureId);
  const home = teamById(String(fixture.homeTeamId));
  const away = teamById(String(fixture.awayTeamId));
  if (!home || !away) {
    throw new Error(`fixture ${fixture.id} slots not filled`);
  }
  return [
    {
      id: fixture.id,
      type: 'MATCH_WINNER',
      fixtureId: fixture.id,
      name: `${home.name} v ${away.name} — Match Winner`,
      status: 'settled',
      selections: [
        { id: `px_${fixture.id}_h`, name: home.name, price: 1.8 },
        { id: `px_${fixture.id}_a`, name: away.name, price: 2.1 },
      ],
    },
    {
      id: 'outright',
      type: 'OUTRIGHT',
      fixtureId: null,
      name: 'Tournament Winner',
      status: 'open',
      selections: [
        { id: `px_out_${home.id}`, name: home.name, price: 5.0 },
        { id: `px_out_${away.id}`, name: away.name, price: 7.0 },
      ],
    },
  ];
}

function makeService(seed?: string): { service: SimulatorService; downstream: DownstreamMock } {
  if (seed === undefined) {
    delete process.env.SIMULATOR_SEED;
  } else {
    process.env.SIMULATOR_SEED = seed;
  }
  const downstream: DownstreamMock = { reprice: vi.fn(), settle: vi.fn() };
  const service = new SimulatorService(downstream as unknown as DownstreamClient);
  downstream.reprice.mockImplementation((settlement: SettlementEvent) =>
    Promise.resolve(repriceResponseFor(service, settlement))
  );
  downstream.settle.mockResolvedValue({ settledBets: 0, totalPaidOut: 0 });
  return { service, downstream };
}

async function playAll(service: SimulatorService): Promise<void> {
  while (service.getState().remainingFixtureIds.length > 0) {
    await service.playNext();
  }
}

afterEach(() => {
  delete process.env.SIMULATOR_SEED;
});

describe('SimulatorService', () => {
  it('starts from the real-world bracket with every fixture unplayed', () => {
    const { service } = makeService();
    const state = SimStateSchema.parse(service.getState());

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

  it('exposes the live bracket: a played fixture shows finished + scores + winner advanced', async () => {
    const { service } = makeService('42');
    const state = SimStateSchema.parse(await service.playNext());

    const opener = fixtureIn(state.fixtures, OPENER);
    expect(opener.status).toBe('finished');
    expect(opener.homeScore).not.toBeNull();
    expect(opener.awayScore).not.toBeNull();
    expect(opener.winnerTeamId).not.toBeNull();
    expect(fixtureIn(state.fixtures, OPENER_FEEDS).homeTeamId).toBe(opener.winnerTeamId);
    expect(state.playedFixtureIds).toEqual([OPENER]);
    expect(state.remainingFixtureIds).not.toContain(OPENER);
  });

  it('is deterministic under a fixed seed', async () => {
    const { service: first } = makeService('1234');
    await playAll(first);
    const { service: second } = makeService('1234');
    await playAll(second);

    expect(second.getState()).toEqual(first.getState());
    expect(first.getState().champion).not.toBeNull();
  });

  it('calls pricing /reprice then betting /settle, resolving winners by team name', async () => {
    const { service, downstream } = makeService('42');
    await service.playNext();

    expect(downstream.reprice).toHaveBeenCalledTimes(1);
    expect(downstream.settle).toHaveBeenCalledTimes(1);
    expect(downstream.reprice.mock.invocationCallOrder[0]).toBeLessThan(
      downstream.settle.mock.invocationCallOrder[0]
    );

    const opener = fixtureIn(service.getState().fixtures, OPENER);
    const settlement = downstream.reprice.mock.calls[0][0] as SettlementEvent;
    expect(settlement.fixtureId).toBe(OPENER);
    expect(settlement.winnerTeamId).toBe(opener.winnerTeamId);
    expect(settlement.homeScore).toBe(opener.homeScore);
    expect(settlement.awayScore).toBe(opener.awayScore);
    expect(settlement.decidedOnPenalties).toBe(opener.homeScore === opener.awayScore);

    const [settleSettlement, winningSelections] = downstream.settle.mock.calls[0] as [
      SettlementEvent,
      { marketId: string; selectionId: string }[],
    ];
    expect(settleSettlement).toEqual(settlement);
    const winnerSide = opener.winnerTeamId === opener.homeTeamId ? 'h' : 'a';
    expect(winningSelections).toEqual([
      { marketId: OPENER, selectionId: `px_${OPENER}_${winnerSide}` },
    ]);
  });

  it('also settles the OUTRIGHT champion when the final is played', async () => {
    const { service, downstream } = makeService('42');
    await playAll(service);

    const champion = service.getState().champion;
    expect(champion).not.toBeNull();
    expect(fixtureIn(service.getState().fixtures, 'F-1').winnerTeamId).toBe(champion);

    const lastSettle = downstream.settle.mock.calls.at(-1) as [
      SettlementEvent,
      { marketId: string; selectionId: string }[],
    ];
    expect(lastSettle[0].fixtureId).toBe('F-1');
    expect(lastSettle[1]).toEqual([
      { marketId: 'F-1', selectionId: expect.stringMatching(/^px_F-1_/) },
      { marketId: 'outright', selectionId: `px_out_${String(champion)}` },
    ]);
  });

  it('survives pricing being down: bracket advances, settlement is skipped', async () => {
    const { service, downstream } = makeService('42');
    downstream.reprice.mockRejectedValue(new Error('ECONNREFUSED'));

    const state = await service.playNext();

    expect(fixtureIn(state.fixtures, OPENER).status).toBe('finished');
    expect(downstream.settle).not.toHaveBeenCalled();
  });

  it('survives betting being down: bracket advances and the run continues', async () => {
    const { service, downstream } = makeService('42');
    downstream.settle.mockRejectedValue(new Error('ECONNREFUSED'));

    await service.playNext();
    const state = await service.playNext();

    expect(state.playedFixtureIds).toEqual([OPENER, 'R32-10']);
  });

  it('skips settlement when the reprice response is missing the settled market', async () => {
    const { service, downstream } = makeService('42');
    downstream.reprice.mockResolvedValue([]);

    const state = await service.playNext();

    expect(fixtureIn(state.fixtures, OPENER).status).toBe('finished');
    expect(downstream.settle).not.toHaveBeenCalled();
  });

  it('treats play-next as a no-op once everything is played', async () => {
    const { service, downstream } = makeService('42');
    await playAll(service);
    const played = service.getState().playedFixtureIds;
    downstream.reprice.mockClear();

    const state = await service.playNext();

    expect(state.playedFixtureIds).toEqual(played);
    expect(downstream.reprice).not.toHaveBeenCalled();
  });

  it('startRun responds immediately and plays everything to the final in the background', async () => {
    const { service, downstream } = makeService('42');
    const immediate = service.startRun(0);
    expect(immediate.champion).toBeNull(); // responded before the run finished

    await vi.waitFor(() => {
      expect(service.getState().champion).not.toBeNull();
    });
    expect(service.getState().remainingFixtureIds).toEqual([]);
    expect(downstream.reprice).toHaveBeenCalledTimes(FIXTURES.length);
  });

  it('ignores a second run while one is active', async () => {
    const { service, downstream } = makeService('42');
    service.startRun(5);
    service.startRun(5);

    await vi.waitFor(
      () => {
        expect(service.getState().champion).not.toBeNull();
      },
      { timeout: 5000 }
    );
    expect(downstream.reprice).toHaveBeenCalledTimes(FIXTURES.length);
  });

  it('reset stops an in-flight run', async () => {
    const { service } = makeService('42');
    service.startRun(20);
    await vi.waitFor(() => {
      expect(service.getState().playedFixtureIds.length).toBeGreaterThan(0);
    });

    service.reset();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(service.getState().playedFixtureIds).toEqual([]);
    expect(service.getState().champion).toBeNull();
  });
});
