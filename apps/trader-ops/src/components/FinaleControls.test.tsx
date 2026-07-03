import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SimState } from '@arena/contracts';
import { STORAGE_KEYS } from '../lib/config';
import { jsonRes, renderAuthed } from '../__tests__/helpers';
import { FinaleControls } from './FinaleControls';

const SIM_STATE: SimState = {
  fixtures: [],
  champion: null,
  playedFixtureIds: [],
  remainingFixtureIds: [],
};

function findCall(mock: ReturnType<typeof vi.fn>, url: string): [string, RequestInit] | undefined {
  const call = mock.mock.calls.find(([u]) => String(u) === url);
  return call as [string, RequestInit] | undefined;
}

function postCount(mock: ReturnType<typeof vi.fn>): number {
  return mock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .length;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('FinaleControls with a stored key', () => {
  it('confirming Play next POSTs to /play-next with x-admin-key and Bearer, then shows a done note', async () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'sim-secret');
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(findCall(fetchMock, 'http://localhost:4003/play-next')).toBeTruthy()
    );
    const [, init] = findCall(fetchMock, 'http://localhost:4003/play-next')!;
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined(); // play-next carries no body
    const headers = new Headers(init.headers);
    expect(headers.get('x-admin-key')).toBe('sim-secret');
    expect(headers.get('Authorization')).toMatch(/^Bearer /);

    expect(await screen.findByText(/^done \d\d:\d\d:\d\d$/)).toBeTruthy();
  });

  it('confirming Run to final sends the intervalMs body as JSON', async () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'sim-secret');
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Run to final' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(findCall(fetchMock, 'http://localhost:4003/run')).toBeTruthy());
    const [, init] = findCall(fetchMock, 'http://localhost:4003/run')!;
    expect(init.body).toBe('{"intervalMs":2000}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('Cancel disarms the confirm without sending a request', () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'sim-secret');
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset bracket' }));
    expect(screen.getByText('Reset the bracket to the real-world state?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Change key while a confirm is armed also disarms it (no dead Confirm button)', () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'sim-secret');
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    expect(screen.getByText('Simulate the next fixture?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change key' }));

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByText(/SIMULATOR_ADMIN_KEY/)).toBeTruthy();
    expect(postCount(fetchMock)).toBe(0);
  });

  it('the Change key button clears the stored key and reveals the prompt', () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'sim-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(SIM_STATE))
    );

    renderAuthed(<FinaleControls />);
    expect(screen.queryByText(/SIMULATOR_ADMIN_KEY/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change key' }));

    expect(screen.getByText(/SIMULATOR_ADMIN_KEY/)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.simAdminKey)).toBeNull();
  });
});

describe('FinaleControls without a stored key', () => {
  it('shows the key prompt and disables the actions so no POST is possible', () => {
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    expect(screen.getByText(/SIMULATOR_ADMIN_KEY/)).toBeTruthy();

    const playNext = screen.getByRole('button', { name: 'Play next' }) as HTMLButtonElement;
    expect(playNext.disabled).toBe(true);
    fireEvent.click(playNext);

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(postCount(fetchMock)).toBe(0);
  });
});

describe('FinaleControls key rejection', () => {
  it('surfaces a 403 as an error note and clears the stale key so the prompt returns', async () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'stale-key');
    const fetchMock = vi.fn(async () => jsonRes({ message: 'forbidden' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/Admin key rejected \(403\)/)).toBeTruthy();
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.simAdminKey)).toBeNull();
  });

  it('treats a 401 on an admin-keyed POST the same way (the shipped guards answer 401)', async () => {
    localStorage.setItem(STORAGE_KEYS.simAdminKey, 'wrong-key');
    const fetchMock = vi.fn(async () => jsonRes({ message: 'x-admin-key header required' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/Admin key rejected \(401\)/)).toBeTruthy();
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.simAdminKey)).toBeNull();
  });
});
