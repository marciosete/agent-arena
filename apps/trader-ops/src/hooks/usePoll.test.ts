import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePoll } from './usePoll';

const NEVER = 600_000;

describe('usePoll', () => {
  it('fetches immediately and exposes data with a fresh timestamp', async () => {
    const fetcher = vi.fn(async () => 'payload');
    const { result, unmount } = renderHook(() => usePoll(fetcher, NEVER));

    await waitFor(() => expect(result.current.data).toBe('payload'));
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt).not.toBeNull();
    unmount();
  });

  it('keeps the last good data when a later poll fails', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('service down');
      }
      return 'good';
    });
    const { result, unmount } = renderHook(() => usePoll(fetcher, 25));

    await waitFor(() => expect(result.current.error).toBe('service down'));
    expect(result.current.data).toBe('good');
    unmount();
  });

  it('clears the error once a poll succeeds again', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('cold start');
      }
      return 'warm';
    });
    const { result, unmount } = renderHook(() => usePoll(fetcher, 25));

    await waitFor(() => expect(result.current.data).toBe('warm'));
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('refresh() forces an immediate refetch without waiting for the interval', async () => {
    const fetcher = vi.fn(async () => 'x');
    const { result, unmount } = renderHook(() => usePoll(fetcher, NEVER));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('discards a slow stale response that resolves after a newer one landed', async () => {
    let call = 0;
    const pending: Array<(value: string) => void> = [];
    const fetcher = vi.fn(() => {
      call += 1;
      if (call === 2) {
        return Promise.resolve('fresh');
      }
      // every other tick hangs until we resolve it by hand
      return new Promise<string>((resolve) => {
        pending.push(resolve);
      });
    });
    const { result, unmount } = renderHook(() => usePoll(fetcher, 25));

    await waitFor(() => expect(result.current.data).toBe('fresh'));
    const freshAt = result.current.updatedAt;
    // the first (older) tick finally resolves — it must be discarded, not applied
    await act(async () => {
      pending[0]('stale');
    });
    expect(result.current.data).toBe('fresh');
    expect(result.current.updatedAt).toBe(freshAt);
    unmount();
  });

  it('notifies onError with the thrown error on an applied failure', async () => {
    const boom = new Error('session expired');
    const onError = vi.fn();
    const fetcher = vi.fn(async () => {
      throw boom;
    });
    const { result, unmount } = renderHook(() => usePoll(fetcher, NEVER, onError));

    await waitFor(() => expect(result.current.error).toBe('session expired'));
    expect(onError).toHaveBeenCalledWith(boom);
    unmount();
  });

  it('stops polling on unmount', async () => {
    const fetcher = vi.fn(async () => 'x');
    const { unmount } = renderHook(() => usePoll(fetcher, 20));

    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2));
    unmount();
    const after = fetcher.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fetcher.mock.calls.length).toBe(after);
  });
});
