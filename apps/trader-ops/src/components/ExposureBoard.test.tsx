import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { ExposureReport } from '@arena/contracts';
import { ExposureBoard } from './ExposureBoard';
import { jsonResponse, renderWithAuth } from '../test/helpers';

const GENERATED_AT = '2026-07-03T12:00:00.000Z';

function report(markets: ExposureReport['markets']): ExposureReport {
  return { generatedAt: GENERATED_AT, markets };
}

const TWO_MARKETS: ExposureReport['markets'] = [
  {
    marketId: 'm-top-scorer',
    marketName: 'Top Scorer',
    totalStaked: 300,
    maxLiability: 800,
    betCount: 2,
    status: 'suspended',
  },
  {
    marketId: 'm-final-winner',
    marketName: 'Final Winner',
    totalStaked: 5_000,
    maxLiability: 12_000,
    betCount: 8,
    status: 'open',
  },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExposureBoard', () => {
  it('renders the exposure board sorted by liability with heat classes and top-line tiles from GET /exposure with the Bearer JWT', async () => {
    let authHeader: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        authHeader = new Headers(init?.headers).get('Authorization');
        if (url.includes('/exposure')) {
          return jsonResponse(report(TWO_MARKETS));
        }
        return jsonResponse({}, 404);
      })
    );

    renderWithAuth(<ExposureBoard />);

    // Children mount only after the seeded session restores.
    await screen.findByText('Final Winner');
    expect(authHeader).toMatch(/^Bearer .+/);

    // Worst-case liability first: the 12,000 market outranks the 800 market.
    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Final Winner');
    expect(rows[1].textContent).toContain('Top Scorer');

    // Heat encoding on the liability numbers.
    expect(screen.getByText('12,000').className).toContain('heat-red');
    expect(screen.getByText('800').className).toContain('heat-low');

    // Top-line tiles are plain aggregates (heat lives on the per-market column,
    // not the book-wide sum): staked 5,300 / liability 12,800 / 1 open market.
    expect(screen.getByText('5,300')).toBeTruthy();
    const liabilityTile = screen.getByText('12,800');
    expect(liabilityTile.className).toBe('tile-value');
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows the flat-book empty state and OFFLINE status when the betting service is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      })
    );

    renderWithAuth(<ExposureBoard />);

    expect(await screen.findByText('OFFLINE')).toBeTruthy();
    expect(screen.getByText('book is flat — no exposure yet')).toBeTruthy();
  });

  it('suspend stays disabled with the pending-contract-amendment tooltip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(report([TWO_MARKETS[1]])))
    );

    renderWithAuth(<ExposureBoard />);

    const button = (await screen.findByRole('button', { name: 'suspend' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('pending contract amendment');
  });

  it('draws empty meters and a low-heat total when the whole book is at zero liability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          report([
            {
              marketId: 'm-cold',
              marketName: 'Group A Winner',
              totalStaked: 0,
              maxLiability: 0,
              betCount: 0,
              status: 'settled',
            },
          ])
        )
      )
    );

    renderWithAuth(<ExposureBoard />);

    // With peak liability 0 the meter fill collapses to 0% and reads low heat.
    await screen.findByText('Group A Winner');
    const fill = document.querySelector('.bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
    expect(fill.className).toContain('heat-low');
  });
});
