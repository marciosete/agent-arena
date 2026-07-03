import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { STORAGE_KEYS } from '../lib/config';
import { fmtClock } from '../lib/format';
import { jsonRes, renderAuthed } from '../__tests__/helpers';
import { FlagsPanel } from './FlagsPanel';

const FLAGS_URL = 'http://localhost:4004/flags';

interface StubFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

/** Fresh flag set per test so a mutating PUT never leaks into the next test. */
function seedFlags(): StubFlag[] {
  return [
    {
      key: 'punter-markets',
      enabled: false,
      description: 'Punter app: markets & odds board',
      updatedAt: '2026-07-03T10:00:00.000Z',
    },
    {
      key: 'punter-confetti',
      enabled: true,
      description: 'Punter app: champion confetti',
      updatedAt: '2026-07-03T09:30:00.000Z',
    },
  ];
}

interface StubOptions {
  flags?: StubFlag[];
  /** Override the GET (e.g. reject to simulate the service being down). */
  onGet?: () => Response | Promise<Response>;
  /** Override the PUT response (default flips the in-memory flag and echoes it). */
  onPut?: (key: string, enabled: boolean) => Response;
}

/** Stub `fetch`, routing by URL + method, and hand back the mock for call assertions. */
function stubFetch(options: StubOptions = {}) {
  const flags = options.flags ?? seedFlags();
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === FLAGS_URL && method === 'GET') {
      return options.onGet ? options.onGet() : jsonRes(flags);
    }
    const put = /\/flags\/([^/]+)$/.exec(url);
    if (put && method === 'PUT') {
      const key = put[1];
      const body = JSON.parse(String(init?.body ?? '{}')) as { enabled: boolean };
      if (options.onPut) {
        return options.onPut(key, body.enabled);
      }
      const flag = flags.find((f) => f.key === key);
      if (!flag) {
        return jsonRes({ message: 'no such flag' }, 404);
      }
      flag.enabled = body.enabled;
      flag.updatedAt = '2026-07-03T12:00:00.000Z';
      return jsonRes(flag);
    }
    return jsonRes({ message: 'unexpected route' }, 404);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function ariaChecked(label: string): string | null {
  return screen.getByLabelText(label).getAttribute('aria-checked');
}

describe('FlagsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the flag list from GET /flags (keys, descriptions, states, times) with a Bearer header', async () => {
    const mock = stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    // keys + descriptions
    expect(await screen.findByText('punter-markets')).toBeTruthy();
    expect(screen.getByText('punter-confetti')).toBeTruthy();
    expect(screen.getByText('Punter app: markets & odds board')).toBeTruthy();
    expect(screen.getByText('Punter app: champion confetti')).toBeTruthy();

    // aria-checked reflects each flag's enabled state
    expect(ariaChecked('toggle punter-markets')).toBe('false');
    expect(ariaChecked('toggle punter-confetti')).toBe('true');

    // last-updated times, formatted through the same clock helper the panel uses
    expect(screen.getByText(fmtClock(Date.parse('2026-07-03T10:00:00.000Z')))).toBeTruthy();
    expect(screen.getByText(fmtClock(Date.parse('2026-07-03T09:30:00.000Z')))).toBeTruthy();

    // the read carried the session JWT (renderAuthed mounts only after the session is live)
    const getCall = mock.mock.calls.find(
      ([u, init]) => String(u) === FLAGS_URL && (init?.method ?? 'GET') === 'GET'
    );
    expect(getCall).toBeTruthy();
    const getHeaders = getCall?.[1]?.headers as Headers;
    expect(getHeaders.get('Authorization')?.startsWith('Bearer ')).toBe(true);
  });

  it('flips a flag via PUT /flags/:key with the x-admin-key header (key from the prompt, kept in localStorage)', async () => {
    const mock = stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    // no key yet: the prompt is shown and every switch is disabled
    await screen.findByText('punter-markets');
    expect(localStorage.getItem(STORAGE_KEYS.flagsAdminKey)).toBeNull();
    expect((screen.getByLabelText('toggle punter-markets') as HTMLButtonElement).disabled).toBe(
      true
    );

    // unlock with an admin key → persisted to localStorage, never bundled
    fireEvent.change(screen.getByPlaceholderText('paste admin key'), {
      target: { value: 'FLIP-42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(localStorage.getItem(STORAGE_KEYS.flagsAdminKey)).toBe('FLIP-42');

    // arm + confirm the release
    fireEvent.click(screen.getByLabelText('toggle punter-markets'));
    expect(screen.getByText('Release punter-markets to production?')).toBeTruthy();
    fireEvent.click(screen.getByText('Confirm'));

    // optimistic flip lands before the PUT resolves
    expect(ariaChecked('toggle punter-markets')).toBe('true');

    // the PUT carried url + method + body + both gates (admin key and Bearer)
    const putCall = mock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(String(putCall?.[0])).toBe('http://localhost:4004/flags/punter-markets');
    expect(putCall?.[1]?.method).toBe('PUT');
    expect(putCall?.[1]?.body).toBe('{"enabled":true}');
    const putHeaders = putCall?.[1]?.headers as Headers;
    expect(putHeaders.get('x-admin-key')).toBe('FLIP-42');
    expect(putHeaders.get('Authorization')?.startsWith('Bearer ')).toBe(true);

    // stays enabled after the confirming refresh
    await waitFor(() => expect(ariaChecked('toggle punter-markets')).toBe('true'));
  });

  it('never fires a PUT while no admin key is stored (switches disabled + prompt shown)', async () => {
    const mock = stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
    expect((screen.getByLabelText('toggle punter-markets') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByLabelText('toggle punter-confetti') as HTMLButtonElement).disabled).toBe(
      true
    );

    const firedPut = mock.mock.calls.some(([, init]) => init?.method === 'PUT');
    expect(firedPut).toBe(false);
  });

  it('a flip rejected 401 (the shipped flags guard) is surfaced clearly, rolls back, and clears the key', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'WRONG-KEY');
    stubFetch({
      onPut: () => jsonRes({ message: 'x-admin-key header required to modify flags' }, 401),
    });
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    fireEvent.click(screen.getByLabelText('toggle punter-markets'));
    fireEvent.click(screen.getByText('Confirm'));

    // clear admin-key text (flags rejects a bad key with 401), and the flip is rolled back
    expect(await screen.findByText(/Admin key rejected \(401\)/)).toBeTruthy();
    await waitFor(() => expect(ariaChecked('toggle punter-markets')).toBe('false'));
    // the rejected key is dropped so the prompt returns
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEYS.flagsAdminKey)).toBeNull());
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
  });

  it('the switch never reverts while the confirming refresh is still in flight', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'FLIP-42');
    const flags = seedFlags();
    let gets = 0;
    const mock = stubFetch({
      flags,
      onGet: () => {
        gets += 1;
        // First GET seeds the panel; the post-PUT refresh hangs (slow network).
        return gets === 1 ? jsonRes(flags) : new Promise<Response>(() => {});
      },
    });
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    fireEvent.click(screen.getByLabelText('toggle punter-markets'));
    fireEvent.click(screen.getByText('Confirm'));

    // wait for the PUT to complete, then a beat longer — the switch must hold ON
    await waitFor(() =>
      expect(mock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(ariaChecked('toggle punter-markets')).toBe('true');
  });

  it('a flip rejected 403 is surfaced and clears the stored admin key so the prompt returns', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'WRONG-KEY');
    stubFetch({ onPut: () => jsonRes({ message: 'no' }, 403) });
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    fireEvent.click(screen.getByLabelText('toggle punter-markets'));
    fireEvent.click(screen.getByText('Confirm'));

    expect(await screen.findByText(/Admin key rejected \(403\)/)).toBeTruthy();
    // the rejected key is dropped and the prompt reappears
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEYS.flagsAdminKey)).toBeNull());
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
    expect(ariaChecked('toggle punter-markets')).toBe('false');
  });

  it('kills an enabled flag: kill prompt + PUT { enabled: false }', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'FLIP-42');
    const mock = stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-confetti');
    fireEvent.click(screen.getByLabelText('toggle punter-confetti'));
    expect(screen.getByText('Kill punter-confetti in production?')).toBeTruthy();
    fireEvent.click(screen.getByText('Confirm'));

    expect(ariaChecked('toggle punter-confetti')).toBe('false');
    const putCall = mock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(String(putCall?.[0])).toBe('http://localhost:4004/flags/punter-confetti');
    expect(putCall?.[1]?.body).toBe('{"enabled":false}');
    await waitFor(() => expect(ariaChecked('toggle punter-confetti')).toBe('false'));
  });

  it('cancelling an armed flip closes the confirm and fires no PUT', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'FLIP-42');
    const mock = stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    fireEvent.click(screen.getByLabelText('toggle punter-markets'));
    expect(screen.getByText('Release punter-markets to production?')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Release punter-markets to production?')).toBeNull();
    expect(ariaChecked('toggle punter-markets')).toBe('false');
    expect(mock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('Change key clears the stored admin key and reopens the prompt', async () => {
    localStorage.setItem(STORAGE_KEYS.flagsAdminKey, 'FLIP-42');
    stubFetch();
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    await screen.findByText('punter-markets');
    // with a key stored the prompt is hidden and switches are live
    expect(screen.queryByPlaceholderText('paste admin key')).toBeNull();
    expect((screen.getByLabelText('toggle punter-markets') as HTMLButtonElement).disabled).toBe(
      false
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change key' }));

    expect(localStorage.getItem(STORAGE_KEYS.flagsAdminKey)).toBeNull();
    expect(screen.getByPlaceholderText('paste admin key')).toBeTruthy();
    expect((screen.getByLabelText('toggle punter-markets') as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('degrades gracefully when the flags service is down (error meta + empty state, no crash)', async () => {
    stubFetch({ onGet: () => Promise.reject(new Error('down')) });
    renderAuthed(<FlagsPanel pollMs={600_000} />);

    // the unreachable message shows in the panel meta
    expect(await screen.findByText('Service unreachable — retrying…')).toBeTruthy();
    // empty state, and no flag rows rendered
    expect(screen.getByText(/Flags service unreachable/)).toBeTruthy();
    expect(screen.queryByLabelText('toggle punter-markets')).toBeNull();
  });
});
