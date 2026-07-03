import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@arena/web-auth';
import { FLAGS, FlagsProvider, useFlagOn } from './flags';
import { arenaAfterEach, flagsOn, seedSession, stubFetch } from './__tests__/harness';

afterEach(arenaAfterEach);

function Probe() {
  const markets = useFlagOn(FLAGS.markets);
  const slip = useFlagOn(FLAGS.betSlip);
  return <output>{JSON.stringify({ markets, slip })}</output>;
}

function renderProbe() {
  seedSession();
  return render(
    <AuthProvider bettingUrl="http://localhost:4002">
      <FlagsProvider>
        <Probe />
      </FlagsProvider>
    </AuthProvider>
  );
}

describe('useFlagOn — gate on import.meta.env.DEV || flag.enabled', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
  });

  it('production: a feature is on only when its flag is enabled', async () => {
    stubFetch({ flags: flagsOn('punter-markets') });
    renderProbe();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('{"markets":true,"slip":false}')
    );
  });

  it('production: an unreachable or malformed flags service means dark', async () => {
    const mock = stubFetch({ flags: [{ nope: true }] });
    renderProbe();
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toBe('{"markets":false,"slip":false}');
  });

  it('local dev: everything shows regardless of flags', async () => {
    vi.stubEnv('DEV', true);
    stubFetch({ flags: [] });
    renderProbe();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('{"markets":true,"slip":true}')
    );
  });

  it('defaults dark outside a provider (no flags context)', () => {
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('{"markets":false,"slip":false}');
  });

  it('FAILS CLOSED: losing the flags service after a good poll darkens features (kill switch lands)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const mock = stubFetch({ flags: flagsOn('punter-markets') });
      renderProbe();
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe('{"markets":true,"slip":false}')
      );
      // The flags service dies right after a trader flips the kill switch…
      mock.mockImplementation(async () => {
        throw new Error('flags down');
      });
      await act(() => vi.advanceTimersByTimeAsync(3_100));
      // …and the app goes dark rather than serving the stale flag list forever.
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe('{"markets":false,"slip":false}')
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
