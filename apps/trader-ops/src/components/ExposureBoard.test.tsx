import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { ExposureReport } from '@arena/contracts';
import { renderAuthed, jsonRes } from '../__tests__/helpers';
import { ExposureBoard } from './ExposureBoard';
import type { ExposureMarket } from '../lib/exposure';

function mkMarket(over: Partial<ExposureMarket>): ExposureMarket {
  return {
    marketId: over.marketId ?? 'm',
    marketName: over.marketName ?? 'Market',
    totalStaked: over.totalStaked ?? 100,
    maxLiability: over.maxLiability ?? 100,
    betCount: over.betCount ?? 1,
    status: over.status ?? 'open',
  };
}

function mkReport(markets: ExposureMarket[]): ExposureReport {
  return { generatedAt: '2026-07-03T12:00:00.000Z', markets };
}

/** Three markets, deliberately out of order, spanning the heat bands. */
function sampleReport(): ExposureReport {
  return mkReport([
    mkMarket({
      marketId: 'mid',
      marketName: 'Mid Risk',
      totalStaked: 200,
      maxLiability: 8_000,
      betCount: 5,
      status: 'suspended',
    }),
    mkMarket({
      marketId: 'low',
      marketName: 'Low Risk',
      totalStaked: 100,
      maxLiability: 1_000,
      betCount: 2,
      status: 'settled',
    }),
    mkMarket({
      marketId: 'high',
      marketName: 'High Risk',
      totalStaked: 300,
      maxLiability: 25_000,
      betCount: 9,
      status: 'open',
    }),
  ]);
}

function bodyRowNames(): (string | null)[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[0].textContent);
}

function tileValue(label: string): string | null {
  const tile = screen.getByText(label).parentElement;
  return tile?.querySelector('.tile-value')?.textContent ?? null;
}

describe('ExposureBoard', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders exposure rows sorted by worst-case liability, biggest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(sampleReport()))
    );
    renderAuthed(<ExposureBoard pollMs={600_000} />);
    await screen.findByText('High Risk');
    expect(bodyRowNames()).toEqual(['High Risk', 'Mid Risk', 'Low Risk']);
  });

  it('heat-colours the liability cell by threshold (low, mid, high)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(sampleReport()))
    );
    renderAuthed(<ExposureBoard pollMs={600_000} />);
    await screen.findByText('High Risk');
    expect(screen.getByText('25,000').className).toContain('heat-high');
    expect(screen.getByText('8,000').className).toContain('heat-mid');
    expect(screen.getByText('1,000').className).toContain('heat-low');
  });

  it('shows book-wide totals in the top-line tiles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(sampleReport()))
    );
    renderAuthed(<ExposureBoard pollMs={600_000} />);
    await screen.findByText('High Risk');
    expect(tileValue('Total staked')).toBe('600');
    expect(tileValue('Worst-case liability')).toBe('34,000');
    expect(tileValue('Open markets')).toBe('1');
  });

  it('sends the Bearer JWT on the exposure GET', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonRes(sampleReport())
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAuthed(<ExposureBoard pollMs={600_000} />);
    await screen.findByText('High Risk');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/exposure'));
    expect(call).toBeTruthy();
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get('Authorization')).toMatch(/^Bearer /);
  });

  it('honours custom heat thresholds', async () => {
    const report = mkReport([
      mkMarket({
        marketId: 'x',
        marketName: 'Tight',
        totalStaked: 100,
        maxLiability: 50,
        betCount: 1,
        status: 'open',
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(report))
    );
    renderAuthed(<ExposureBoard pollMs={600_000} thresholds={{ mid: 40, high: 90 }} />);
    await screen.findByText('Tight');
    expect(screen.getByRole('cell', { name: '50' }).className).toContain('heat-mid');
  });

  it('shows the empty state when the book has no markets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(mkReport([])))
    );
    renderAuthed(<ExposureBoard />);
    expect(await screen.findByText('No exposure to report.')).toBeTruthy();
  });

  it('keeps rendering and surfaces the error when the poll fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      })
    );
    renderAuthed(<ExposureBoard pollMs={600_000} />);
    await screen.findByText(/unreachable/i);
    expect(screen.getByText('Total staked')).toBeTruthy();
    expect(screen.getByText('No exposure to report.')).toBeTruthy();
  });
});
