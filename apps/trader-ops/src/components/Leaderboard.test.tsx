import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { Account } from '@arena/contracts';
import { UNREACHABLE_MESSAGE } from '../lib/api';
import { jsonRes, renderAuthed } from '../__tests__/helpers';
import { Leaderboard } from './Leaderboard';

let seq = 0;
function acc(overrides: Partial<Account> = {}): Account {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${n}`,
    email: `p${seq}@example.com`,
    name: `Punter ${seq}`,
    balance: 10_000,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Book with a bot leader, three podium winners, a fourth-place winner, and a loser. */
const BOOK: Account[] = [
  acc({ name: 'Zephyr', balance: 8_000 }), // rank 5, loser
  acc({ name: 'RiskBot', balance: 15_000, isBot: true }), // rank 1, hot bot
  acc({ name: 'Casey', balance: 10_500 }), // rank 4, winner but not hot
  acc({ name: 'Ada', balance: 12_000 }), // rank 2, hot
  acc({ name: 'Milo', balance: 11_000 }), // rank 3, hot
];

function stubFetch(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonRes(body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  seq = 0;
});

function bodyRow(container: HTMLElement, name: string): HTMLElement {
  const rows = Array.from(container.querySelectorAll('tbody tr')) as HTMLElement[];
  const row = rows.find((r) => r.querySelector('td:nth-child(2)')?.textContent?.includes(name));
  if (!row) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

describe('Leaderboard rendering', () => {
  it('renders rows in leaderboard order (balance descending) with 1-based ranks and nicknames', async () => {
    const fetchMock = stubFetch(BOOK);
    const { container } = renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('RiskBot');

    // The nickname is the cell's leading text node; chips (BOT/HOT) are trailing spans.
    const order = Array.from(container.querySelectorAll('tbody tr td:nth-child(2)')).map((c) =>
      c.firstChild?.textContent?.trim()
    );
    expect(order).toEqual(['RiskBot', 'Ada', 'Milo', 'Casey', 'Zephyr']);

    const ranks = Array.from(container.querySelectorAll('tbody tr td:nth-child(1)')).map(
      (c) => c.textContent
    );
    expect(ranks).toEqual(['1', '2', '3', '4', '5']);

    expect(fetchMock).toHaveBeenCalled();
  });

  it('flags the leading bot with a BOT chip and leaves humans unchipped', async () => {
    stubFetch(BOOK);
    const { container } = renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('RiskBot');
    expect(bodyRow(container, 'RiskBot').querySelector('.chip-bot')).toBeTruthy();
    expect(bodyRow(container, 'Ada').querySelector('.chip-bot')).toBeNull();
  });

  it('flags the top-three winners HOT — but not a fourth-place winner', async () => {
    stubFetch(BOOK);
    const { container } = renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('RiskBot');

    for (const winner of ['RiskBot', 'Ada', 'Milo']) {
      expect(bodyRow(container, winner).querySelector('.chip-hot')).toBeTruthy();
    }
    // Casey is up on the day but sits 4th — never hot.
    expect(bodyRow(container, 'Casey').querySelector('.chip-hot')).toBeNull();
    // Zephyr is a loser — never hot.
    expect(bodyRow(container, 'Zephyr').querySelector('.chip-hot')).toBeNull();
  });

  it('renders signed, colour-coded P&L (pos for winners, neg for losers)', async () => {
    stubFetch(BOOK);
    const { container } = renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('RiskBot');

    const bot = bodyRow(container, 'RiskBot').querySelector('td:nth-child(4)');
    expect(bot?.textContent).toBe('+5,000');
    expect(bot?.classList.contains('pos')).toBe(true);

    const loser = bodyRow(container, 'Zephyr').querySelector('td:nth-child(4)');
    expect(loser?.textContent).toBe('-2,000');
    expect(loser?.classList.contains('neg')).toBe(true);
  });

  it('renders a break-even P&L neutrally (no pos/neg colour)', async () => {
    stubFetch([acc({ name: 'Even', balance: 10_000 })]);
    const { container } = renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('Even');

    const pnl = bodyRow(container, 'Even').querySelector('td:nth-child(4)');
    expect(pnl?.textContent).toBe('0');
    expect(pnl?.classList.contains('pos')).toBe(false);
    expect(pnl?.classList.contains('neg')).toBe(false);
  });

  it('sends the Bearer JWT on the GET /accounts read', async () => {
    const fetchMock = stubFetch(BOOK);
    renderAuthed(<Leaderboard pollMs={600_000} />);
    await screen.findByText('RiskBot');

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/accounts'));
    expect(call).toBeTruthy();
    const url = String(call?.[0]);
    expect(url).toContain('/accounts');
    const headers = new Headers((call?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get('authorization')).toMatch(/^Bearer .+/);
  });

  it('shows the empty state when the book has no accounts', async () => {
    stubFetch([]);
    renderAuthed(<Leaderboard pollMs={600_000} />);
    const empty = await screen.findByText(/No punters on the book yet/);
    expect(empty.classList.contains('empty')).toBe(true);
  });

  it('surfaces a fetch failure in the panel meta without crashing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAuthed(<Leaderboard pollMs={600_000} />);

    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeTruthy();
    // Panel chrome is still mounted — the board degraded, it did not crash.
    expect(screen.getByLabelText('Punter watchlist')).toBeTruthy();
  });
});
