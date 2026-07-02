import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SimState } from '@arena/contracts';
import { renderWithAuth, jsonResponse } from '../test/helpers';
import { FinaleControls } from './FinaleControls';

const STORAGE_KEY = 'trader.adminKey.simulator';
const ADMIN_KEY = 'sk-simulator-1';
const AUTH_HEADER = 'Authorization';
const KEY_HEADER = 'x-admin-key';

const ROLE_BUTTON = 'button';
const ROLE_STATUS = 'status';
const ROLE_ALERT = 'alert';

const PLAY_NEXT_PATH = '/play-next';
const RESET_PATH = '/reset';

const PLAY_NEXT = /play next fixture/i;
const RUN_TO_FINAL = /run to final/i;
const RESET_BRACKET = /reset bracket/i;
const CONFIRM = /confirm/i;
const ABORT = /abort/i;

function simState(overrides: Partial<SimState> = {}): SimState {
  return {
    fixtures: [],
    champion: null,
    playedFixtureIds: [],
    remainingFixtureIds: [],
    ...overrides,
  };
}

/** Stub the global fetch every request routes through, returning `response`. */
function stubFetch(response: Response | (() => Promise<Response>)) {
  const handler = typeof response === 'function' ? response : async () => response;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => handler());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Headers actually put on the wire for the nth (default first) fetch call. */
function headersOf(fetchMock: ReturnType<typeof stubFetch>, call = 0): Headers {
  return new Headers(fetchMock.mock.calls[call][1]?.headers);
}

describe('FinaleControls', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('play-next posts with the Bearer JWT and x-admin-key and reports the bracket position, noting a crowned champion', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    const fetchMock = stubFetch(
      jsonResponse(
        simState({ playedFixtureIds: ['f1', 'f2', 'f3'], remainingFixtureIds: [], champion: 'BRA' })
      )
    );
    renderWithAuth(<FinaleControls />);

    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: PLAY_NEXT }));

    const status = await screen.findByRole(ROLE_STATUS);
    expect(status.textContent).toBe('bracket: 3 played · 0 remaining · champion crowned');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(PLAY_NEXT_PATH);
    const headers = headersOf(fetchMock);
    expect(headers.get(AUTH_HEADER)).toMatch(/^Bearer /);
    expect(headers.get(KEY_HEADER)).toBe(ADMIN_KEY);
  });

  it('run-to-final posts an intervalMs body and reports the run started (not the pre-run counts)', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    // /run returns the pre-run state immediately; the console must not read those
    // stale zero counts as "done" — it announces the run started instead.
    const fetchMock = stubFetch(
      jsonResponse(simState({ playedFixtureIds: [], remainingFixtureIds: ['f1', 'f2', 'f3'] }))
    );
    renderWithAuth(<FinaleControls />);

    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: RUN_TO_FINAL }));

    const status = await screen.findByRole(ROLE_STATUS);
    expect(status.textContent).toContain('run started');
    expect(status.textContent).not.toContain('0 played');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/run');
    expect(init?.body).toBe(JSON.stringify({ intervalMs: 2000 }));
  });

  it('reset only fires after the two-step confirm', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    const fetchMock = stubFetch(jsonResponse(simState()));
    renderWithAuth(<FinaleControls />);

    // First click arms the confirm strip — nothing is sent yet.
    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: RESET_BRACKET }));
    expect(fetchMock).not.toHaveBeenCalled();

    // Aborting cancels back to the single button and still sends nothing.
    fireEvent.click(screen.getByRole(ROLE_BUTTON, { name: ABORT }));
    expect(screen.queryByRole(ROLE_BUTTON, { name: CONFIRM })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // Re-arm and confirm — now (and only now) the reset posts.
    fireEvent.click(screen.getByRole(ROLE_BUTTON, { name: RESET_BRACKET }));
    fireEvent.click(screen.getByRole(ROLE_BUTTON, { name: CONFIRM }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain(RESET_PATH);
  });

  it('a command without the admin key surfaces the 403 clearly', async () => {
    const fetchMock = stubFetch(jsonResponse({ error: 'forbidden' }, 403));
    renderWithAuth(<FinaleControls />);

    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: PLAY_NEXT }));

    const alert = await screen.findByRole(ROLE_ALERT);
    expect(alert.textContent).toContain('admin key');
    expect(headersOf(fetchMock).get(KEY_HEADER)).toBeNull();
  });

  it('controls lock while a command is in flight', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    stubFetch(() => new Promise<Response>(() => {})); // never settles — command stays in flight
    renderWithAuth(<FinaleControls />);

    const playNext = await screen.findByRole(ROLE_BUTTON, { name: PLAY_NEXT });
    fireEvent.click(playNext);

    await waitFor(() => expect((playNext as HTMLButtonElement).disabled).toBe(true));
    expect(
      (screen.getByRole(ROLE_BUTTON, { name: RUN_TO_FINAL }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole(ROLE_BUTTON, { name: RESET_BRACKET }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('a 401 rejection tells the operator to sign in again', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    stubFetch(jsonResponse({ error: 'unauthorized' }, 401));
    renderWithAuth(<FinaleControls />);

    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: PLAY_NEXT }));

    const alert = await screen.findByRole(ROLE_ALERT);
    expect(alert.textContent).toContain('sign in again');
  });

  it('a transport failure surfaces a generic unreachable message', async () => {
    localStorage.setItem(STORAGE_KEY, ADMIN_KEY);
    stubFetch(() => Promise.reject(new Error('network down')));
    renderWithAuth(<FinaleControls />);

    fireEvent.click(await screen.findByRole(ROLE_BUTTON, { name: RUN_TO_FINAL }));

    const alert = await screen.findByRole(ROLE_ALERT);
    expect(alert.textContent).toBe('simulator unreachable or errored');
  });
});
