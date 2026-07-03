import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  arenaAfterEach,
  marketFor,
  outrightMarket,
  renderRoot,
  renderWithProviders,
  seedSession,
  simState,
  simStateLive,
  simStateWithResult,
  stubFetch,
} from '../__tests__/harness';
import { marketsByFixture } from '../join';
import { BracketScreen, BracketView, type BracketViewProps } from './Bracket';

afterEach(arenaAfterEach);

function viewProps(overrides: Partial<BracketViewProps> = {}): BracketViewProps {
  return {
    fixtures: simState().fixtures,
    champion: null,
    markets: marketsByFixture([marketFor('R32-9')]),
    outright: outrightMarket(),
    marketsOn: true,
    slipOn: true,
    confettiOn: false,
    onPick: vi.fn(),
    ...overrides,
  };
}

describe('the bracket is the home route, laid out from GET /state (DoD)', () => {
  it('renders the radial bracket at / from SimState.fixtures, and a decided fixture lights its winner path toward the centre', async () => {
    vi.stubEnv('DEV', true);
    seedSession();
    stubFetch({ state: simStateWithResult(), markets: [marketFor('R32-9')] });
    renderRoot();

    const svg = await screen.findByRole('img', { name: 'Road to the Final bracket' });
    // Structure: 23 live fixtures + the 8-game R32 prologue → 31 fixtures, 62 edges.
    await waitFor(() => expect(svg.querySelectorAll('.edge:not(.entry-hop)').length).toBe(62));
    expect(svg.querySelectorAll('.ring-label').length).toBe(5);

    // Every level is visible: the full 32-nation rim includes who the pre-placed
    // R16 teams beat — Brazil past a greyed-out Japan, France past Sweden — with
    // their decided paths carrying them onto the R16 ring (the key art exactly).
    expect(svg.querySelector('.node[data-team="JPN"]')).not.toBeNull();
    expect(svg.querySelector('.node-out[data-team="JPN"]')).not.toBeNull();
    expect(svg.querySelector('.node-advanced[data-team="BRA"]')).not.toBeNull();
    expect(screen.getByText(/0–1/)).toBeTruthy(); // South Africa 0–1 Canada chip
    // The prologue is data-complete, so no synthetic hop fallbacks remain.
    expect(svg.querySelectorAll('.entry-hop')).toHaveLength(0);

    // POR beat CRO in R32-9: that path lights in Portugal's colour, the loser
    // goes dark, and the winner occupies the next ring's slot (propagated by
    // the simulator). 8 prologue wins + POR = 9 lit paths.
    const won = [...svg.querySelectorAll<SVGElement>('.edge.edge-won')];
    expect(won).toHaveLength(9);
    expect(won.some((edge) => edge.style.getPropertyValue('--team-color') === '#d81e2c')).toBe(
      true
    );
    expect(svg.querySelectorAll('.edge.edge-lost')).toHaveLength(9);
    expect(svg.querySelector('.node-advanced[data-team="POR"]')).not.toBeNull();
    expect(svg.querySelector('.node-out[data-team="CRO"]')).not.toBeNull();
    // POR–CRO, BRA–JPN and ENG–COD all finished 2–1.
    expect(screen.getAllByText(/2–1/).length).toBeGreaterThanOrEqual(3);

    // Key-art language: elbowed traces with junction dots, no guide circles.
    expect(svg.querySelectorAll('.edge-joint').length).toBeGreaterThan(40);
    expect(svg.querySelectorAll('.joint-won')).toHaveLength(9);
    expect(svg.querySelectorAll('circle.ring')).toHaveLength(0);
  });

  it('renders the shipped seed’s live facts: four decided R32 games plus the prologue', () => {
    const { container } = render(
      <BracketView {...viewProps({ fixtures: simStateLive().fixtures })} />
    );
    // 8 prologue results + POR, ESP, USA, BEL from the updated seed = 12 lit paths.
    expect(container.querySelectorAll('.edge.edge-won')).toHaveLength(12);
    expect(container.querySelector('.node-advanced[data-team="POR"]')).not.toBeNull();
    expect(container.querySelector('.node-advanced[data-team="ESP"]')).not.toBeNull();
    expect(container.querySelector('.node-advanced[data-team="USA"]')).not.toBeNull();
    expect(container.querySelector('.node-advanced[data-team="BEL"]')).not.toBeNull();
    expect(container.querySelector('.node-out[data-team="CRO"]')).not.toBeNull();
    expect(container.querySelector('.node-out[data-team="SEN"]')).not.toBeNull();
    expect(screen.getByText(/3–2/)).toBeTruthy(); // Belgium 3–2 Senegal
  });

  it('shows a quiet skeleton while the simulator is unreachable (parallel build)', async () => {
    seedSession();
    stubFetch({ stateDown: true });
    renderWithProviders(<BracketScreen />);
    expect(await screen.findByText('Connecting to the arena…')).toBeTruthy();
  });
});

describe('fixture nodes read odds via the Market.fixtureId join (DoD)', () => {
  it('clicking a fixture opens its detail card with prices, and a price button opens the slip with the right marketId/selectionId', () => {
    const onPick = vi.fn();
    const { container } = render(<BracketView {...viewProps({ onPick })} />);

    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    const card = screen.getByRole('dialog', { name: 'Fixture' });
    expect(card.textContent).toContain('Portugal');
    expect(card.textContent).toContain('Croatia');
    expect(card.textContent).toContain('Round of 32');

    fireEvent.click(screen.getByRole('button', { name: '1.85' }));
    expect(onPick).toHaveBeenCalledWith({
      marketId: 'R32-9',
      selectionId: 'sel-POR',
      selectionName: 'Portugal',
      marketName: 'Portugal v Croatia',
      price: 1.85,
    });
    // Picking a price hands over to the slip and closes the card.
    expect(screen.queryByRole('dialog', { name: 'Fixture' })).toBeNull();
  });

  it('a fixture without a market (or with the slip dark) renders info-only', () => {
    const { container, rerender } = render(<BracketView {...viewProps({ markets: new Map() })} />);
    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    expect(screen.getByRole('dialog', { name: 'Fixture' }).textContent).toContain('no market yet');
    expect(screen.queryByRole('button', { name: '1.85' })).toBeNull();

    rerender(<BracketView {...viewProps({ slipOn: false })} />);
    fireEvent.click(container.querySelector('.node[data-team="CRO"]') as Element);
    const card = screen.getByRole('dialog', { name: 'Fixture' });
    expect(card.textContent).toContain('1.85'); // price shown flat…
    expect(screen.queryByRole('button', { name: '1.85' })).toBeNull(); // …but not bettable
  });

  it('a finished fixture card shows the score and derives a penalties note', () => {
    const state = simStateWithResult();
    const played = state.fixtures.find((fixture) => fixture.id === 'R32-9')!;
    played.homeScore = 1;
    played.awayScore = 1; // level + winner ⇒ penalties (derived, not stored)
    const { container } = render(<BracketView {...viewProps({ fixtures: state.fixtures })} />);
    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    const card = screen.getByRole('dialog', { name: 'Fixture' });
    expect(card.textContent).toContain('decided on penalties');
    expect(card.querySelectorAll('.card-score')).toHaveLength(2);
  });
});

describe('hover highlights a team’s whole road to the final', () => {
  it('lights the feedsInto chain and dims the rest, with a price tooltip', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    fireEvent.mouseEnter(container.querySelector('.node[data-team="POR"]') as Element);

    // R32-9 → R16-5 → QF-3 → SF-2 → F-1: five lit segments.
    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(5);
    expect(container.querySelectorAll('.edge.is-faded').length).toBeGreaterThan(30);
    const tip = screen.getByRole('status');
    expect(tip.textContent).toContain('Portugal');
    expect(tip.textContent).toContain('1.85');

    fireEvent.mouseLeave(container.querySelector('.node[data-team="POR"]') as Element);
    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(0);
  });

  it('falls back to the outright title price for teams without an open fixture market', () => {
    const { container } = render(<BracketView {...viewProps({ markets: new Map() })} />);
    fireEvent.mouseEnter(container.querySelector('.node[data-team="POR"]') as Element);
    expect(screen.getByRole('status').textContent).toContain('title 8.50');
  });

  it('hovering a fixture edge highlights the matchup and shows both prices', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    fireEvent.mouseEnter(container.querySelector('.edge-hit[data-fixture="R32-9"]') as Element);
    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toContain('Portugal v Croatia');
  });

  it('hovering a prologue fixture tells its finished story (Brazil 2–1 Japan)', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    fireEvent.mouseEnter(container.querySelector('.edge-hit[data-fixture="R32-5"]') as Element);
    const tip = screen.getByRole('status').textContent;
    expect(tip).toContain('Brazil v Japan');
    expect(tip).toContain('FT 2–1');
  });
});

describe('keyboard operability (review fix)', () => {
  it('team nodes are focusable buttons: Enter opens the fixture card, focus lights the path', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    const node = container.querySelector('.node[data-team="POR"]') as SVGElement;
    expect(node.getAttribute('role')).toBe('button');
    expect(node.getAttribute('tabindex')).toBe('0');

    fireEvent.focus(node);
    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(5);
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Fixture' })).toBeTruthy();
  });

  it('the trophy opens the outright with the keyboard when markets are on', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    fireEvent.keyDown(container.querySelector('.trophy') as Element, { key: ' ' });
    expect(screen.getByRole('dialog', { name: 'Tournament winner market' })).toBeTruthy();
  });
});

describe('undecided slots and card states', () => {
  it('an undecided winner-slot is a grey dot: hover shows the matchup, click opens the TBD card', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    const dot = container.querySelector('.slot-dot') as Element;
    fireEvent.mouseEnter(dot);
    expect(screen.getByRole('status').textContent).toContain('TBD');
    fireEvent.mouseLeave(dot);
    fireEvent.click(dot);
    expect(screen.getByRole('dialog', { name: 'Fixture' }).textContent).toContain('TBD');
  });

  it('clicking empty arena space dismisses the card', () => {
    const { container } = render(<BracketView {...viewProps()} />);
    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    expect(screen.getByRole('dialog', { name: 'Fixture' })).toBeTruthy();
    fireEvent.click(container.querySelector('.bracket-backdrop') as Element);
    expect(screen.queryByRole('dialog', { name: 'Fixture' })).toBeNull();
  });

  it('reflects a suspended market and an in-play fixture in the status line', () => {
    const suspended = marketsByFixture([marketFor('R32-9', { status: 'suspended' })]);
    const { container, rerender } = render(<BracketView {...viewProps({ markets: suspended })} />);
    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    expect(screen.getByRole('dialog', { name: 'Fixture' }).textContent).toContain('suspended');

    const state = simState();
    state.fixtures.find((fixture) => fixture.id === 'R32-9')!.status = 'in_play';
    rerender(<BracketView {...viewProps({ fixtures: state.fixtures })} />);
    fireEvent.click(container.querySelector('.node[data-team="POR"]') as Element);
    expect(screen.getByRole('dialog', { name: 'Fixture' }).textContent).toContain('In play');
  });

  it('marks a penalties result on the score chip', () => {
    const state = simStateWithResult();
    const played = state.fixtures.find((fixture) => fixture.id === 'R32-9')!;
    played.homeScore = 2;
    played.awayScore = 2; // level + winner ⇒ penalties (unique among the chips)
    render(<BracketView {...viewProps({ fixtures: state.fixtures })} />);
    expect(screen.getByText(/2–2 ᴾ/)).toBeTruthy();
    // The prologue's shoot-out games carry the marker too (NED–MAR, GER–PAR).
    expect(screen.getAllByText(/1–1 ᴾ/)).toHaveLength(2);
  });
});

describe('the trophy opens the outright (title) market', () => {
  it('clicking the centre opens the outright card, cheapest price first, and picks feed the slip', () => {
    const onPick = vi.fn();
    const { container } = render(<BracketView {...viewProps({ onPick })} />);
    fireEvent.click(container.querySelector('.trophy') as Element);

    const card = screen.getByRole('dialog', { name: 'Tournament winner market' });
    const prices = [...card.querySelectorAll('.price-btn')].map((b) => b.textContent);
    expect(prices).toEqual(['4.20', '5.00', '8.50']);

    fireEvent.click(screen.getByRole('button', { name: '4.20' }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ marketId: 'outright', selectionId: 'out-FRA' })
    );
  });

  it('is not clickable while punter-markets is dark', () => {
    const { container } = render(<BracketView {...viewProps({ marketsOn: false })} />);
    fireEvent.click(container.querySelector('.trophy') as Element);
    expect(screen.queryByRole('dialog', { name: 'Tournament winner market' })).toBeNull();
  });

  it('says so when the title market is not priced yet', () => {
    const { container } = render(<BracketView {...viewProps({ outright: null })} />);
    fireEvent.click(container.querySelector('.trophy') as Element);
    expect(screen.getByRole('dialog', { name: 'Tournament winner market' }).textContent).toContain(
      'isn’t priced yet'
    );
  });

  it('shows outright prices flat while the bet slip is dark', () => {
    const { container } = render(<BracketView {...viewProps({ slipOn: false })} />);
    fireEvent.click(container.querySelector('.trophy') as Element);
    const card = screen.getByRole('dialog', { name: 'Tournament winner market' });
    expect(card.querySelectorAll('.price-flat')).toHaveLength(3);
    expect(card.querySelectorAll('.price-btn')).toHaveLength(0);
  });
});

describe('champion & confetti', () => {
  it('docks the champion beside the trophy and bursts confetti when the flag is on', () => {
    const state = simState({ champion: 'FRA' });
    const { container } = render(
      <BracketView
        {...viewProps({ fixtures: state.fixtures, champion: 'FRA', confettiOn: true })}
      />
    );
    expect(container.querySelector('.champion[data-team="FRA"]')).not.toBeNull();
    expect(screen.getByText('FRANCE · CHAMPIONS')).toBeTruthy();
    expect(container.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0);
  });

  it('keeps confetti dark without punter-confetti', () => {
    const { container } = render(
      <BracketView {...viewProps({ champion: 'FRA', confettiOn: false })} />
    );
    expect(container.querySelector('.confetti')).toBeNull();
  });
});
