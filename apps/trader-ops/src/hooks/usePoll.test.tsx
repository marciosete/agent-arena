import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../lib/api';
import { usePoll } from './usePoll';

const ok = (value: number): ApiResult<number> => ({ ok: true, data: value });
const fail = (status: number | null): ApiResult<number> => ({
  ok: false,
  status,
  message: 'HTTP 503',
});

describe('usePoll', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches immediately and exposes data with a live tick', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(1));
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it('keeps the last good data when a later poll fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ok(1)).mockResolvedValue(fail(503));
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.data).toBe(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe(1);
    expect(result.current.error).toBe('HTTP 503');
    expect(result.current.errorStatus).toBe(503);
  });

  it('clears the error once a poll succeeds again', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(fail(null)).mockResolvedValue(ok(2));
    const { result } = renderHook(() => usePoll(fetcher, 60_000));
    await waitFor(() => expect(result.current.error).toBe('HTTP 503'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe(2);
    expect(result.current.error).toBeNull();
    expect(result.current.errorStatus).toBeNull();
  });

  it('polls again on the interval', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(ok(1));
    renderHook(() => usePoll(fetcher, 3_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops polling after unmount', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(ok(1));
    const { unmount } = renderHook(() => usePoll(fetcher, 3_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
