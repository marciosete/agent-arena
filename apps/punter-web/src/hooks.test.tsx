import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@arena/web-auth';
import { useBalanceRefresh, usePoll } from './hooks';
import { ACCOUNT, arenaAfterEach, seedSession, stubFetch } from './__tests__/harness';

afterEach(arenaAfterEach);

function PollProbe({ source }: Readonly<{ source: () => Promise<string | null> }>) {
  const value = usePoll(source, 1_000);
  return <output>{value ?? 'none'}</output>;
}

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches immediately, then on the interval', async () => {
    let count = 0;
    const source = vi.fn(async () => {
      count += 1;
      return `v${count}`;
    });
    render(<PollProbe source={source} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('v1'));
    await act(() => vi.advanceTimersByTimeAsync(1_050));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('v2'));
  });

  it('keeps the last good value when a poll fails (returns null)', async () => {
    const replies: (string | null)[] = ['good', null, null];
    const source = vi.fn(async () => replies.shift() ?? null);
    render(<PollProbe source={source} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('good'));
    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(screen.getByRole('status').textContent).toBe('good');
  });

  it('stops polling on unmount', async () => {
    const source = vi.fn(async () => 'v');
    const { unmount } = render(<PollProbe source={source} />);
    await waitFor(() => expect(source).toHaveBeenCalled());
    const calls = source.mock.calls.length;
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(source.mock.calls.length).toBe(calls);
  });
});

function BalanceProbe() {
  useBalanceRefresh(1_000);
  return null;
}

describe('useBalanceRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads the account on the interval so the wallet chip stays live', async () => {
    seedSession();
    const mock = stubFetch({ account: { ...ACCOUNT, balance: 9_900 } });
    render(
      <AuthProvider bettingUrl="http://localhost:4002">
        <BalanceProbe />
      </AuthProvider>
    );
    await act(() => vi.advanceTimersByTimeAsync(1_050));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([input]) => String(input).includes(`/accounts/${ACCOUNT.id}`))
      ).toBe(true)
    );
  });
});
