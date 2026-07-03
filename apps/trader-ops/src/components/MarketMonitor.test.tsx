import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type { Market } from '@arena/contracts';
import { MarketMonitor } from './MarketMonitor';
import { UNREACHABLE_MESSAGE } from '../lib/api';
import { SERVICE_URLS } from '../lib/config';
import { jsonRes, renderAuthed } from '../__tests__/helpers';

/** Far-future cadence: one immediate poll, no further ticks — for static assertions. */
const SLOW = 600_000;

const SNAPSHOT_A: Market[] = [
  {
    id: 'm-eng-fra',
    type: 'MATCH_WINNER',
    fixtureId: 'f1',
    name: 'England vs France',
    status: 'open',
    selections: [
      { id: 's-eng', name: 'England', price: 2.1, probability: 0.45 },
      { id: 's-fra', name: 'France', price: 3.4, probability: 0.28 },
      { id: 's-draw', name: 'Draw', price: 3.2 },
    ],
  },
  {
    id: 'm-out',
    type: 'OUTRIGHT',
    fixtureId: null,
    name: 'Tournament winner',
    status: 'suspended',
    selections: [
      { id: 's-bra', name: 'Brazil', price: 5, probability: 0.19 },
      { id: 's-arg', name: 'Argentina', price: 6, probability: 0.16 },
    ],
  },
];

/** Same markets as A, but England's price rose and France's fell. */
const SNAPSHOT_B: Market[] = [
  {
    id: 'm-eng-fra',
    type: 'MATCH_WINNER',
    fixtureId: 'f1',
    name: 'England vs France',
    status: 'open',
    selections: [
      { id: 's-eng', name: 'England', price: 2.4, probability: 0.4 },
      { id: 's-fra', name: 'France', price: 3.1, probability: 0.31 },
      { id: 's-draw', name: 'Draw', price: 3.2 },
    ],
  },
  {
    id: 'm-out',
    type: 'OUTRIGHT',
    fixtureId: null,
    name: 'Tournament winner',
    status: 'suspended',
    selections: [
      { id: 's-bra', name: 'Brazil', price: 5, probability: 0.19 },
      { id: 's-arg', name: 'Argentina', price: 6, probability: 0.16 },
    ],
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** The <tr> containing an exact-text cell (e.g. a selection name). */
function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) {
    throw new Error(`no table row for "${name}"`);
  }
  return row as HTMLElement;
}

describe('MarketMonitor', () => {
  it('renders market names, status chips, prices and fair probabilities from GET /markets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(SNAPSHOT_A))
    );

    renderAuthed(<MarketMonitor pollMs={SLOW} />);

    // Market names.
    await screen.findByText('England vs France');
    expect(screen.getByText('Tournament winner')).toBeTruthy();

    // Status chips (chip text is the raw status string).
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('suspended')).toBeTruthy();

    // Prices (decimal odds, 2dp).
    expect(screen.getByText('2.10')).toBeTruthy();
    expect(screen.getByText('3.40')).toBeTruthy();
    expect(screen.getByText('5.00')).toBeTruthy();

    // Fair probability alongside; the book total (overround) surfaced per market.
    expect(screen.getByText('45.0%')).toBeTruthy();
    expect(screen.getByText('book 108.3%')).toBeTruthy();
  });

  it("shows '—' when a selection has no fair probability", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(SNAPSHOT_A))
    );

    renderAuthed(<MarketMonitor pollMs={SLOW} />);

    // Draw carries a price but no probability.
    const drawRow = await waitFor(() => rowFor('Draw'));
    expect(within(drawRow).getByText('3.20')).toBeTruthy();
    expect(within(drawRow).getByText('—')).toBeTruthy();
  });

  it('sends the Bearer JWT on the GET to the pricing /markets endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => jsonRes(SNAPSHOT_A));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<MarketMonitor pollMs={SLOW} />);
    await screen.findByText('England vs France');

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SERVICE_URLS.pricing}/markets`);
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toMatch(/^Bearer /);
  });

  it('highlights a selection whose price moved between polls (px-up and px-down)', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return jsonRes(calls === 1 ? SNAPSHOT_A : SNAPSHOT_B);
      })
    );

    renderAuthed(<MarketMonitor pollMs={80} />);

    // First poll: snapshot A, no moves yet.
    await screen.findByText('England vs France');
    expect(within(rowFor('England')).getByText('2.10').className).not.toContain('px-up');

    // Second poll: England rose (px-up), France fell (px-down).
    await waitFor(() => {
      expect(within(rowFor('England')).getByText('2.40').className).toContain('px-up');
    });
    expect(within(rowFor('France')).getByText('3.10').className).toContain('px-down');
  });

  it('clears move highlights when a subsequent poll fails (no stale flashes in an outage)', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return jsonRes(SNAPSHOT_A);
        }
        if (calls === 2) {
          return jsonRes(SNAPSHOT_B);
        }
        throw new Error('pricing down');
      })
    );

    renderAuthed(<MarketMonitor pollMs={60} />);

    // Second poll lights the flash…
    await waitFor(() => {
      expect(within(rowFor('England')).getByText('2.40').className).toContain('px-up');
    });
    // …then the outage extinguishes it while the last-good prices stay on screen.
    await waitFor(() => {
      expect(within(rowFor('England')).getByText('2.40').className).not.toContain('px-up');
    });
    expect(screen.getByText('England vs France')).toBeTruthy();
  });

  it('shows the empty state when there are no markets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([]))
    );

    renderAuthed(<MarketMonitor pollMs={SLOW} />);

    expect(await screen.findByText(/no markets/i)).toBeTruthy();
  });

  it('surfaces a fetch failure in the panel meta without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    renderAuthed(<MarketMonitor pollMs={SLOW} />);

    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeTruthy();
    // Panel still mounted — title present, no crash.
    expect(screen.getByText('Market monitor')).toBeTruthy();
  });
});
