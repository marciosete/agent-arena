import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { SimState } from '@arena/contracts';
import { NOT_ADMIN_MESSAGE } from '../lib/api';
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

describe('FinaleControls', () => {
  it('confirming Play next POSTs to /play-next with the Bearer and no x-admin-key, then shows a done note', async () => {
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
    expect(headers.get('x-admin-key')).toBeNull();
    expect(headers.get('Authorization')).toMatch(/^Bearer /);

    expect(await screen.findByText(/^done \d\d:\d\d:\d\d$/)).toBeTruthy();
  });

  it('confirming Run to final sends the intervalMs body as JSON', async () => {
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
    const fetchMock = vi.fn(async () => jsonRes(SIM_STATE));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset bracket' }));
    expect(screen.getByText('Reset the bracket to the real-world state?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('arms only one action at a time — the others disable until the confirm resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes(SIM_STATE))
    );

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));

    expect(screen.getByText('Simulate the next fixture?')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Run to final' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Reset bracket' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('surfaces a 403 as the not-an-admin message and fires no further POST', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ message: 'forbidden' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(NOT_ADMIN_MESSAGE)).toBeTruthy();
    expect(postCount(fetchMock)).toBe(1);
    // there is no admin-key prompt any more — a 403 is not-an-admin, not a bad key
    expect(screen.queryByPlaceholderText('paste admin key')).toBeNull();
  });

  it('treats a 401 on a control POST as an expired session and returns to the login page', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ message: 'token expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    renderAuthed(<FinaleControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Sign in to Arena')).toBeTruthy();
    expect(localStorage.getItem('arena.token')).toBeNull();
  });
});
