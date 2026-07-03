import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  arenaAfterEach,
  marketFor,
  outrightMarket,
  renderWithProviders,
  seedSession,
  simState,
  stubFetch,
} from '../__tests__/harness';
import { MarketsBoard, MarketsPage } from './MarketsPage';

afterEach(arenaAfterEach);

const noFlashes = new Map<string, 'up' | 'down'>();

function boardProps(overrides: Partial<Parameters<typeof MarketsBoard>[0]> = {}) {
  return {
    markets: [marketFor('R32-9')],
    fixtures: simState().fixtures,
    flashes: noFlashes,
    slipOn: true,
    onPick: vi.fn(),
    ...overrides,
  };
}

describe('markets board', () => {
  it('groups fixtures by round with flags, names and kickoff, ordered home/away', () => {
    render(<MarketsBoard {...boardProps()} />);
    expect(screen.getByRole('heading', { name: 'Round of 32' })).toBeTruthy();
    expect(screen.getByText(/🇵🇹 Portugal/)).toBeTruthy();
    expect(screen.getByText(/Croatia 🇭🇷/)).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toContain('Portugal');
    expect(buttons[0].textContent).toContain('1.85');
    expect(buttons[1].textContent).toContain('Croatia');
    expect(buttons[1].textContent).toContain('2.10');
  });

  it('clicking a price hands the selection to the slip', () => {
    const onPick = vi.fn();
    render(<MarketsBoard {...boardProps({ onPick })} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onPick).toHaveBeenCalledWith({
      marketId: 'R32-9',
      selectionId: 'sel-POR',
      selectionName: 'Portugal',
      marketName: 'Portugal v Croatia',
      price: 1.85,
    });
  });

  it('flashes a moved price with its direction', () => {
    const flashes = new Map<string, 'up' | 'down'>([
      ['sel-POR', 'up'],
      ['sel-CRO', 'down'],
    ]);
    render(<MarketsBoard {...boardProps({ flashes })} />);
    const [home, away] = screen.getAllByRole('button');
    expect(home.className).toContain('flash-up');
    expect(away.className).toContain('flash-down');
  });

  it('renders suspended/settled markets clearly non-clickable', () => {
    render(
      <MarketsBoard {...boardProps({ markets: [marketFor('R32-9', { status: 'suspended' })] })} />
    );
    expect(screen.getByText('SUSPENDED')).toBeTruthy();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true);
    }
  });

  it('disables prices while the bet slip flag is dark', () => {
    render(<MarketsBoard {...boardProps({ slipOn: false })} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true);
    }
  });

  it('keeps the market’s own selection order when names don’t match the fixture teams', () => {
    const odd = marketFor('R32-9', {
      selections: [
        { id: 's1', name: 'Mystery A', price: 1.5 },
        { id: 's2', name: 'Mystery B', price: 2.5 },
      ],
    });
    render(<MarketsBoard {...boardProps({ markets: [odd] })} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toContain('Mystery A');
    expect(buttons[1].textContent).toContain('Mystery B');
  });

  it('orders fixtures within a round by kickoff', () => {
    const later = marketFor('R32-10', {
      id: 'R32-10',
      name: 'Spain v Austria',
      selections: [
        { id: 's-ESP', name: 'Spain', price: 1.6 },
        { id: 's-AUT', name: 'Austria', price: 2.4 },
      ],
    });
    // R32-9 kicks off before R32-10 in the seed.
    render(<MarketsBoard {...boardProps({ markets: [later, marketFor('R32-9')] })} />);
    const rows = document.querySelectorAll('.market-row');
    expect(rows[0].textContent).toContain('Portugal');
    expect(rows[1].textContent).toContain('Spain');
  });

  it('an outright-only or unjoinable response shows the friendly note, not a blank board', () => {
    render(<MarketsBoard {...boardProps({ markets: [outrightMarket(), marketFor('nope-99')] })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/Markets are being priced/)).toBeTruthy();
  });

  it('shows a friendly note while pricing has nothing yet', () => {
    render(<MarketsBoard {...boardProps({ markets: [] })} />);
    expect(screen.getByText(/Markets are being priced/)).toBeTruthy();
  });
});

describe('markets page (polls pricing + sim state)', () => {
  it('renders live rows from GET /markets joined to fixtures', async () => {
    seedSession();
    stubFetch({ markets: [marketFor('R32-9')], state: simState() });
    renderWithProviders(<MarketsPage />);
    expect(await screen.findByText(/🇵🇹 Portugal/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Markets' })).toBeTruthy();
  });

  it('degrades to the empty note while pricing is down', async () => {
    seedSession();
    stubFetch({ rejectAll: true });
    renderWithProviders(<MarketsPage />);
    expect(await screen.findByText(/Markets are being priced/)).toBeTruthy();
  });
});
