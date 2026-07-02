import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { TEAMS, type Fixture, type SimState } from '@arena/contracts';
import { jsonResponse, renderWithAuth } from '../test/helpers';
import { SettlementFeed } from './SettlementFeed';

const [T0, T1] = TEAMS;

function fixture(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    round: 'QF',
    kickoff: '2026-07-01T12:00:00.000Z',
    homeTeamId: T0.id,
    awayTeamId: T1.id,
    feedsInto: 'F-SF-1',
    feedsIntoSlot: 'home',
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: T0.id,
    ...overrides,
  };
}

function simState(fixtures: Fixture[], champion: string | null = null): SimState {
  return {
    fixtures,
    champion,
    playedFixtureIds: fixtures.filter((f) => f.status === 'finished').map((f) => f.id),
    remainingFixtureIds: fixtures.filter((f) => f.status !== 'finished').map((f) => f.id),
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettlementFeed', () => {
  it('renders finished results newest on top with a pens badge from GET /state with the Bearer JWT', async () => {
    const authHeaders: Array<string | null> = [];
    const state = simState([
      fixture({ id: 'early', kickoff: '2026-07-01T12:00:00.000Z', round: 'QF' }),
      fixture({
        id: 'late',
        kickoff: '2026-07-05T20:00:00.000Z',
        round: 'SF',
        homeScore: 1,
        awayScore: 1,
        winnerTeamId: T1.id, // level score with a winner => penalties
      }),
      fixture({
        id: 'pending',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        authHeaders.push(new Headers(init?.headers).get('Authorization'));
        return jsonResponse(state);
      })
    );

    renderWithAuth(<SettlementFeed />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2); // the scheduled fixture is dropped

    // Newest kickoff (the semi-final) sits on top and carries the pens badge.
    expect(items[0].textContent).toContain('SF');
    expect(items[0].textContent).toContain('pens');
    expect(items[0].textContent).toContain(`${T0.name} 1–1 ${T1.name}`);
    expect(items[0].textContent).toContain(`winner ${T1.name}`);
    expect(items[0].textContent).toContain('market late settled');

    expect(items[1].textContent).toContain('QF');
    expect(items[1].textContent).not.toContain('pens');

    expect(authHeaders.some((header) => header?.startsWith('Bearer '))).toBe(true);
  });

  it('shows the champion banner once a champion is crowned', async () => {
    const state = simState(
      [fixture({ id: 'final', round: 'F', homeScore: 3, awayScore: 1, winnerTeamId: T0.id })],
      T0.id
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(state))
    );

    renderWithAuth(<SettlementFeed />);

    expect(await screen.findByText(`champion — ${T0.name} 🏆`)).toBeTruthy();
  });

  it('labels an unresolved champion id raw', async () => {
    const state = simState(
      [fixture({ id: 'final', round: 'F', homeScore: 2, awayScore: 0, winnerTeamId: T0.id })],
      'ZZZ' // an id no longer in the team table
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(state))
    );

    renderWithAuth(<SettlementFeed />);

    expect(await screen.findByText('champion — ZZZ 🏆')).toBeTruthy();
  });

  it('shows an empty state until the first result lands', async () => {
    const state = simState([
      fixture({
        id: 'up-next',
        status: 'in_play',
        homeScore: 0,
        awayScore: 0,
        winnerTeamId: null,
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(state))
    );

    renderWithAuth(<SettlementFeed />);

    expect(await screen.findByText('no results yet — the bracket is live')).toBeTruthy();
  });
});
