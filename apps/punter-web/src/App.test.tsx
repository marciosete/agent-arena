import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const FLAG_FIXTURE = [
  {
    key: 'punter-markets',
    enabled: false,
    description: 'markets',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  {
    key: 'punter-bracket',
    enabled: true,
    description: 'bracket',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
];

function stubFetch(options: {
  reject?: boolean;
  healthOk?: boolean;
  flagsOk?: boolean;
  flags?: unknown;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: unknown) => {
      if (options.reject) {
        return Promise.reject(new Error('service down'));
      }
      if (String(input).endsWith('/flags')) {
        return Promise.resolve({
          ok: options.flagsOk ?? true,
          json: async () => options.flags ?? [],
        });
      }
      return Promise.resolve({ ok: options.healthOk ?? true });
    })
  );
}

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the event brand', () => {
    stubFetch({});
    render(<App />);
    expect(screen.getByText('Road to the Final')).toBeTruthy();
  });

  it('shows every service online when health checks succeed', async () => {
    stubFetch({});
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
  });

  it('shows services offline when health checks are rejected', async () => {
    stubFetch({ reject: true });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
  });

  it('shows services offline when health checks respond unhealthy', async () => {
    stubFetch({ healthOk: false, flagsOk: false });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(4));
    expect(screen.queryByLabelText('feature flags')).toBeNull();
  });

  it('renders flags with their live/dark state', async () => {
    stubFetch({ flags: FLAG_FIXTURE });
    render(<App />);
    await waitFor(() => expect(screen.getByText('punter-markets')).toBeTruthy());
    expect(screen.getAllByText('dark')).toHaveLength(1);
    expect(screen.getAllByText('live')).toHaveLength(1);
  });

  it('hides the flag strip when the payload is malformed', async () => {
    stubFetch({ flags: [{ nope: true }] });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(4));
    expect(screen.queryByLabelText('feature flags')).toBeNull();
  });
});
