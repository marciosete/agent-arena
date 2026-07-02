import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { FeatureFlag } from '@arena/contracts';
import { FlagsPanel } from './FlagsPanel';
import { jsonResponse, renderWithAuth } from '../test/helpers';

const NOW = '2026-07-03T10:00:00.000Z';
const STORAGE_KEY = 'trader.adminKey.flags';
const ADMIN_KEY = 'launch-code';
const MARKETS_KEY = 'punter-markets';
const FINALE_KEY = 'finale-mode';

const markets: FeatureFlag = {
  key: MARKETS_KEY,
  enabled: false,
  description: 'Punter app: markets & odds board',
  updatedAt: NOW,
};
const finale: FeatureFlag = {
  key: FINALE_KEY,
  enabled: true,
  description: 'Punter app: finale takeover',
  updatedAt: NOW,
};

type FetchArgs = [string, RequestInit?];
type FetchStub = Mock<(url: string, init?: RequestInit) => Promise<Response>>;

/** Stub GET /flags with `list`; route PUT /flags/:key to `onPut`. */
function stubFlags(
  list: FeatureFlag[],
  onPut: (key: string, body: { enabled: boolean }) => Response
): FetchStub {
  const fetchSpy: FetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'PUT') {
      const key = new URL(url).pathname.split('/').pop() ?? '';
      const body = JSON.parse(String(init?.body)) as { enabled: boolean };
      return onPut(key, body);
    }
    return jsonResponse(list);
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

const putCalls = (fetchSpy: FetchStub): FetchArgs[] =>
  fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PUT') as FetchArgs[];

const header = (init: RequestInit | undefined, name: string): string | null =>
  new Headers(init?.headers).get(name);

/** Arm the release for a flag and press CONFIRM. */
async function releaseFlag(flagKey: string): Promise<void> {
  const toggle = await screen.findByRole('switch', { name: `toggle ${flagKey}` });
  fireEvent.click(toggle);
  fireEvent.click(await screen.findByRole('button', { name: 'confirm' }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FlagsPanel', () => {
  it('lists flags from GET /flags with the Bearer JWT attached', async () => {
    const fetchSpy = stubFlags([markets, finale], () => jsonResponse(markets));
    renderWithAuth(<FlagsPanel />);

    // Sorted by key: finale-mode before punter-markets.
    expect(await screen.findByText(FINALE_KEY)).toBeTruthy();
    expect(screen.getByText(MARKETS_KEY)).toBeTruthy();
    expect(screen.getByText('Punter app: markets & odds board')).toBeTruthy();

    const [, init] = fetchSpy.mock.calls[0];
    expect(header(init, 'Authorization')).toMatch(/^Bearer .+/);
  });

  it('flips a flag via PUT /flags/:key with the x-admin-key header and { enabled } body after confirm', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    const fetchSpy = stubFlags([markets], () => jsonResponse({ ...markets, enabled: true }));
    renderWithAuth(<FlagsPanel />);

    await releaseFlag(MARKETS_KEY);

    const toggle = screen.getByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));

    const [url, init] = putCalls(fetchSpy)[0];
    expect(url.endsWith(`/flags/${MARKETS_KEY}`)).toBe(true);
    expect(init?.method).toBe('PUT');
    expect(header(init, 'x-admin-key')).toBe(ADMIN_KEY);
    expect(header(init, 'Authorization')).toMatch(/^Bearer .+/);
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: true });
  });

  it('a flip without the admin key is rejected and the 401 is surfaced with a rollback', async () => {
    const fetchSpy = stubFlags([markets], () => jsonResponse({ message: 'no session' }, 401));
    renderWithAuth(<FlagsPanel />);

    await releaseFlag(MARKETS_KEY);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/401/);
    expect(alert.textContent).toMatch(/sign in/i);

    const toggle = screen.getByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(header(putCalls(fetchSpy)[0][1], 'x-admin-key')).toBeNull();
  });

  it('a 403 admin-key rejection rolls back the optimistic flip', async () => {
    localStorage.setItem(STORAGE_KEY, 'stale-key');
    stubFlags([markets], () => jsonResponse({ message: 'bad key' }, 403));
    renderWithAuth(<FlagsPanel />);

    await releaseFlag(MARKETS_KEY);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/403/);
    expect(alert.textContent).toMatch(/admin key/i);

    const toggle = screen.getByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  });

  it('abort cancels an armed flip without any PUT', async () => {
    const fetchSpy = stubFlags([markets], () => jsonResponse(markets));
    renderWithAuth(<FlagsPanel />);

    const toggle = await screen.findByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByRole('button', { name: 'abort' }));

    expect(screen.queryByRole('button', { name: 'confirm' })).toBeNull();
    expect(putCalls(fetchSpy)).toHaveLength(0);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('shows a warming-up empty state until the flags service responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'warming up' }, 503))
    );
    renderWithAuth(<FlagsPanel />);

    expect(await screen.findByText(/flags service warming up/)).toBeTruthy();
  });

  it('surfaces the generic failure copy and rolls back on a 5xx release error', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    stubFlags([markets], () => jsonResponse({ message: 'boom' }, 500));
    renderWithAuth(<FlagsPanel />);

    await releaseFlag(MARKETS_KEY);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/release failed/);
    const toggle = screen.getByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  });

  it('drops the optimistic override once the poll reports the released state', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    let released = false;
    const fetchSpy: FetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        released = true;
        return jsonResponse({ ...markets, enabled: true });
      }
      return jsonResponse([{ ...markets, enabled: released }]);
    });
    vi.stubGlobal('fetch', fetchSpy);
    renderWithAuth(<FlagsPanel />);

    await releaseFlag(MARKETS_KEY);

    const toggle = screen.getByRole('switch', { name: `toggle ${MARKETS_KEY}` });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    // The poll now returns enabled:true, so the override reconciles away but the
    // rendered state stays released.
    expect(putCalls(fetchSpy)).toHaveLength(1);
  });
});
