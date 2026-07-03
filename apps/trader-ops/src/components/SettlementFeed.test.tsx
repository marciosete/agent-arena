import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { FIXTURES, type SimState } from '@arena/contracts';
import { UNREACHABLE_MESSAGE } from '../lib/api';
import { jsonRes, renderAuthed } from '../__tests__/helpers';
import { SettlementFeed } from './SettlementFeed';

const SLOW = 600_000;

function baseState(): SimState {
  return {
    fixtures: structuredClone(FIXTURES),
    champion: null,
    playedFixtureIds: [],
    remainingFixtureIds: [],
  };
}

function setFinished(
  state: SimState,
  id: string,
  homeScore: number,
  awayScore: number,
  winnerTeamId: string
): void {
  const fixture = state.fixtures.find((f) => f.id === id);
  if (!fixture) {
    throw new Error(`no seed fixture ${id}`);
  }
  fixture.status = 'finished';
  fixture.homeScore = homeScore;
  fixture.awayScore = awayScore;
  fixture.winnerTeamId = winnerTeamId;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('SettlementFeed', () => {
  it('renders finished fixtures newest-first with result, PENS tag, winner and settled market', async () => {
    const state = baseState();
    setFinished(state, 'R32-9', 2, 1, 'POR'); // earlier kickoff, decisive
    setFinished(state, 'R32-15', 1, 1, 'SUI'); // later kickoff, level -> penalties
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(state))
    );

    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    await screen.findByText(/market R32-15 settled/);

    const items = document.querySelectorAll('.feed-item');
    expect(items.length).toBe(2);
    // Later kickoff (R32-15) sits above the earlier one (R32-9).
    expect(items[0].textContent).toMatch(/Switzerland 1.1 Algeria/);
    expect(items[0].textContent).toContain('Switzerland advance');
    expect(items[0].querySelector('.tag-pens')?.textContent).toBe('PENS');
    expect(items[0].textContent).toContain('R32 · market R32-15 settled');
    expect(items[1].textContent).toMatch(/Portugal 2.1 Croatia/);
    expect(items[1].textContent).toContain('Portugal advance');
    expect(items[1].querySelector('.tag-pens')).toBeNull();
  });

  it('shows the champion banner when a champion is set', async () => {
    const state = baseState();
    setFinished(state, 'F-1', 3, 2, 'ARG');
    state.fixtures.find((f) => f.id === 'F-1')!.homeTeamId = 'ARG';
    state.fixtures.find((f) => f.id === 'F-1')!.awayTeamId = 'FRA';
    state.champion = 'ARG';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(state))
    );

    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    expect(await screen.findByText('🏆 Argentina are world champions')).toBeTruthy();
  });

  it('falls back to the raw id in the banner for an unknown champion', async () => {
    const state = baseState();
    state.champion = 'ZZZ';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(state))
    );

    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    expect(await screen.findByText('🏆 ZZZ are world champions')).toBeTruthy();
  });

  it('carries the session Bearer token on the state GET to the simulator', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonRes(baseState())
    );
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    await screen.findByText('No fixtures settled yet.');

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/state'));
    expect(String(call?.[0])).toBe('http://localhost:4003/state');
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get('Authorization')).toMatch(/^Bearer /);
  });

  it('renders the empty state when nothing has been played', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(baseState()))
    );
    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    expect(await screen.findByText('No fixtures settled yet.')).toBeTruthy();
  });

  it('surfaces a fetch failure in the panel meta without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      })
    );
    renderAuthed(<SettlementFeed pollMs={SLOW} />);
    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeTruthy();
    // Still renders its empty state — a blip never blanks the board.
    expect(screen.getByText('No fixtures settled yet.')).toBeTruthy();
  });
});
