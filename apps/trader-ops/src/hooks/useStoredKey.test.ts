import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStoredKey } from './useStoredKey';

const SLOT = 'test.admin-key';

describe('useStoredKey', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts with null when nothing is stored', () => {
    const { result } = renderHook(() => useStoredKey(SLOT));
    expect(result.current[0]).toBeNull();
  });

  it('restores a previously stored key', () => {
    localStorage.setItem(SLOT, 'sesame');
    const { result } = renderHook(() => useStoredKey(SLOT));
    expect(result.current[0]).toBe('sesame');
  });

  it('persists a new key to localStorage', () => {
    const { result } = renderHook(() => useStoredKey(SLOT));
    act(() => result.current[1]('open-up'));
    expect(result.current[0]).toBe('open-up');
    expect(localStorage.getItem(SLOT)).toBe('open-up');
  });

  it('clears the key when set to null', () => {
    localStorage.setItem(SLOT, 'sesame');
    const { result } = renderHook(() => useStoredKey(SLOT));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(localStorage.getItem(SLOT)).toBeNull();
  });

  it('treats unreadable storage as no key', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useStoredKey(SLOT));
    expect(result.current[0]).toBeNull();
  });

  it('still tracks the key in memory when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useStoredKey(SLOT));
    act(() => result.current[1]('ephemeral'));
    expect(result.current[0]).toBe('ephemeral');
  });
});
