import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { FIXTURES } from '@arena/contracts';
import {
  flag,
  matchMarket,
  outrightMarket,
  playedFixtures,
  renderApp,
  simState,
  stubServices,
} from '../test/helpers';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

const ESP_MARKET = matchMarket({
  id: 'R32-10',
  fixtureId: 'R32-10',
  name: 'Spain v Austria',
  selections: [
    { id: 'sel-esp', name: 'Spain', price: 1.55 },
    { id: 'sel-aut', name: 'Austria', price: 2.6 },
  ],
});

describe('the bracket — home route, laid out from GET /state', () => {
  it('renders every live fixture by round and lights the decided winner path gold', async () => {
    stubServices({ state: simState(playedFixtures()) });
    const { container } = renderApp();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy()
    );
    // POR appears at its R32 entry AND propagated into the R16-5 winner slot.
    await waitFor(() => expect(screen.getAllByText('POR')).toHaveLength(2));
    // The winner's edge is lit; the loser's is dead; nothing else is decided.
    expect(container.querySelectorAll('.edge-lit')).toHaveLength(1);
    expect(container.querySelectorAll('.edge-dead')).toHaveLength(1);
    expect(screen.getByText('2–1')).toBeTruthy();
  });

  it('joins a fixture to its market by fixtureId and opens the pre-filled bet slip', async () => {
    const { calls } = stubServices({
      markets: [ESP_MARKET],
      bets: [],
    });
    renderApp();
    const node = await screen.findByRole('button', { name: 'Spain — open R32-10' });
    fireEvent.click(node);
    // Detail card shows the joined market's prices.
    const back = await screen.findByRole('button', { name: 'Back Spain at 1.55' });
    fireEvent.click(back);
    const drawer = await screen.findByRole('dialog', { name: 'bet slip' });
    expect(drawer.textContent).toContain('Spain');
    expect(drawer.textContent).toContain('1.55');
    // Place it and prove the exact ids travelled through.
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bet' }));
    await waitFor(() => {
      const post = calls.find(
        (entry) => entry.url.endsWith('/bets') && entry.init?.method === 'POST'
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.init?.body));
      expect(body.marketId).toBe('R32-10');
      expect(body.selectionId).toBe('sel-esp');
    });
  });

  it('opens the outright market from the trophy, favourites first', async () => {
    stubServices();
    renderApp();
    const trophy = await screen.findByRole('button', { name: 'outright market' });
    fireEvent.click(trophy);
    const card = await screen.findByRole('dialog', { name: 'outright market' });
    expect(card.textContent).toContain('Tournament Winner');
    const prices = Array.from(card.querySelectorAll('.price-odds')).map((el) => el.textContent);
    expect(prices).toEqual(['4.50', '6.00']);
    fireEvent.click(screen.getByRole('button', { name: 'Back Spain at 4.50' }));
    const drawer = await screen.findByRole('dialog', { name: 'bet slip' });
    expect(drawer.textContent).toContain('Spain');
    expect(drawer.textContent).toContain('4.50');
  });

  it('hovering a team lights its whole road to the centre and shows its price', async () => {
    stubServices({ markets: [matchMarket()] });
    const { container } = renderApp();
    const node = await screen.findByRole('button', { name: 'Portugal — open R32-9' });
    fireEvent.mouseEnter(node);
    expect(container.querySelector('.bracket-wrap--focus')).toBeTruthy();
    // POR's road: R32-9 → R16-5 → QF-3 → SF-2 → F-1 — one edge per hop.
    expect(container.querySelectorAll('.edge-focus')).toHaveLength(5);
    const tip = container.querySelector('.bracket-tip');
    expect(tip?.textContent).toContain('Portugal');
    expect(tip?.textContent).toContain('1.80 to win the tie');
    fireEvent.mouseLeave(node);
    await waitFor(() => expect(container.querySelector('.bracket-wrap--focus')).toBeNull());
  });

  it('hovering a fixture edge shows the matchup and both prices', async () => {
    stubServices({ markets: [ESP_MARKET] });
    const { container } = renderApp();
    await screen.findByRole('img', { name: 'Road to the Final bracket' });
    const edge = screen.getAllByRole('button', { name: 'R32-10 match' })[0];
    fireEvent.mouseEnter(edge);
    const tip = container.querySelector('.bracket-tip');
    expect(tip?.textContent).toContain('Spain v Austria');
    expect(tip?.textContent).toContain('1.55 / 2.60');
  });

  it('docks the champion beside the trophy and fires the confetti', async () => {
    stubServices({ state: simState(FIXTURES, 'ESP') });
    const { container } = renderApp();
    await waitFor(() => expect(screen.getByText('SPAIN · CHAMPIONS')).toBeTruthy());
    expect(container.querySelector('.confetti')).toBeTruthy();
  });

  it('renders the seed constellation as a skeleton while the simulator is unreachable', async () => {
    stubServices({ state: { status: 500, body: {} } });
    renderApp();
    expect(screen.getByRole('img', { name: 'Road to the Final bracket' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Connecting to the live bracket…')).toBeTruthy());
  });

  it('supports keyboard activation and clears the card on a backdrop click', async () => {
    stubServices();
    const { container } = renderApp();
    const node = await screen.findByRole('button', { name: 'Portugal — open R32-9' });
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'R32-9 details' })).toBeTruthy();
    const backdrop = container.querySelector('.bracket-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    expect(screen.queryByRole('dialog', { name: 'R32-9 details' })).toBeNull();
  });

  it('keeps the trophy inert while punter-markets is dark in production', async () => {
    vi.stubEnv('DEV', false);
    stubServices({ flags: [flag('punter-bracket')] });
    renderApp();
    const trophy = await screen.findByRole('button', { name: 'outright market' });
    fireEvent.keyDown(trophy, { key: ' ' });
    fireEvent.click(trophy);
    expect(screen.queryByRole('dialog', { name: 'outright market' })).toBeNull();
  });

  it('ignites a path when a result lands between polls', async () => {
    // Serve the unplayed seed for the first couple of polls (session restore
    // can re-tick immediately), then land the result — news, not history.
    let call = 0;
    stubServices({
      state: () => {
        call += 1;
        return call <= 2 ? simState(FIXTURES) : simState(playedFixtures());
      },
    });
    const { container } = renderApp();
    await waitFor(() => expect(container.querySelector('.edge-ignite')).toBeTruthy(), {
      timeout: 4_000,
    });
    // The burn-down must survive later polls re-running the effect: the
    // ignition clears ~1.8s after it lands, settling back to a lit path.
    await waitFor(() => expect(container.querySelector('.edge-ignite')).toBeNull(), {
      timeout: 4_000,
    });
    expect(container.querySelector('.edge-lit')).toBeTruthy();
  });
});

describe('detail cards and tooltips across market/fixture states', () => {
  it('shows TBD teams and "No market yet" for an inner-round fixture without a market', async () => {
    stubServices({ markets: [] });
    renderApp();
    await screen.findByRole('img', { name: 'Road to the Final bracket' });
    fireEvent.click(screen.getAllByRole('button', { name: 'SF-1 match' })[0]);
    const card = await screen.findByRole('dialog', { name: 'SF-1 details' });
    expect(card.textContent).toContain('Semi-finals');
    expect(card.textContent).toContain('TBD');
    expect(card.textContent).toContain('No market yet');
  });

  it('describes an in-play fixture and a settled market', async () => {
    const inPlay = FIXTURES.map((fixture) =>
      fixture.id === 'R32-9' ? { ...fixture, status: 'in_play' as const } : fixture
    );
    stubServices({
      state: simState(inPlay),
      markets: [matchMarket({ status: 'settled' })],
    });
    renderApp();
    const node = await screen.findByRole('button', { name: 'Portugal — open R32-9' });
    fireEvent.click(node);
    const card = await screen.findByRole('dialog', { name: 'R32-9 details' });
    expect(card.textContent).toContain('In play');
    expect(card.textContent).toContain('Market settled');
  });

  it('marks a penalties result in the card and disables a suspended market', async () => {
    const pens = FIXTURES.map((fixture) =>
      fixture.id === 'R32-9'
        ? {
            ...fixture,
            status: 'finished' as const,
            homeScore: 1,
            awayScore: 1,
            winnerTeamId: 'POR',
          }
        : fixture
    );
    stubServices({
      state: simState(pens),
      markets: [matchMarket({ status: 'suspended' })],
    });
    renderApp();
    const node = await screen.findByRole('button', { name: 'Portugal — open R32-9' });
    fireEvent.click(node);
    const card = await screen.findByRole('dialog', { name: 'R32-9 details' });
    expect(card.textContent).toContain('1 – 1 · pens');
    expect(card.textContent).toContain('Market suspended');
    expect(
      (screen.getByRole('button', { name: 'Back Portugal at 1.80' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('handles a missing or non-open outright market gracefully', async () => {
    stubServices({ outright: { status: 500, body: {} } });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'outright market' }));
    const card = await screen.findByRole('dialog', { name: 'outright market' });
    await waitFor(() => expect(card.textContent).toContain('No outright market yet'));
    fireEvent.click(screen.getByRole('button', { name: 'close details' }));

    cleanup();
    stubServices({ outright: outrightMarket({ status: 'suspended' }) });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'outright market' }));
    const suspended = await screen.findByRole('dialog', { name: 'outright market' });
    expect(suspended.textContent).toContain('Market suspended');
    expect(
      (screen.getByRole('button', { name: 'Back Spain at 4.50' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('tips an eliminated team, an outright-only team, and a bare name when nothing is priced', async () => {
    stubServices({
      state: simState(playedFixtures()),
      markets: [],
      outright: outrightMarket({
        selections: [
          { id: 'out-por', name: 'Portugal', price: 7.5 },
          { id: 'out-esp', name: 'Spain', price: 4.5 },
        ],
      }),
    });
    const { container } = renderApp();
    // CRO lost R32-9 — eliminated.
    const cro = await screen.findByRole('button', { name: 'Croatia — open R32-9' });
    fireEvent.mouseEnter(cro);
    expect(container.querySelector('.bracket-tip')?.textContent).toContain('Eliminated');
    fireEvent.mouseLeave(cro);
    // POR won and has no match market — falls back to the title price.
    const por = screen.getAllByRole('button', { name: /Portugal — open/ })[0];
    fireEvent.mouseEnter(por);
    expect(container.querySelector('.bracket-tip')?.textContent).toContain(
      '7.50 to lift the trophy'
    );
    fireEvent.mouseLeave(por);

    cleanup();
    stubServices({ markets: { status: 500, body: {} }, outright: { status: 500, body: {} } });
    const second = renderApp();
    const bare = await screen.findByRole('button', { name: 'Portugal — open R32-9' });
    fireEvent.mouseEnter(bare);
    const tip = second.container.querySelector('.bracket-tip');
    expect(tip?.textContent).toBe('Portugal');
  });

  it('shows the scoreline tooltip (with pens) from the score pill', async () => {
    const pens = playedFixtures().map((fixture) =>
      fixture.id === 'R32-9' ? { ...fixture, homeScore: 1, awayScore: 1 } : fixture
    );
    stubServices({ state: simState(pens) });
    const { container } = renderApp();
    const pill = await screen.findByText('1–1 ᵖ');
    fireEvent.mouseEnter(pill);
    const tip = container.querySelector('.bracket-tip');
    expect(tip?.textContent).toContain('Portugal v Croatia');
    expect(tip?.textContent).toContain('1 – 1 (pens)');
  });

  it('tips a future fixture with just the matchup and round', async () => {
    stubServices({ markets: [] });
    const { container } = renderApp();
    await screen.findByRole('img', { name: 'Road to the Final bracket' });
    fireEvent.mouseEnter(screen.getAllByRole('button', { name: 'SF-1 match' })[0]);
    const tip = container.querySelector('.bracket-tip');
    expect(tip?.textContent).toContain('TBD v TBD');
    expect(tip?.textContent).toContain('Semi-finals');
  });
});
