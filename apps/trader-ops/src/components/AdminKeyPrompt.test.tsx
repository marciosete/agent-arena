import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { AdminKeyPrompt, useAdminKey } from './AdminKeyPrompt';

const LABEL = 'flags admin key';
const STORAGE_KEY = 'trader.adminKey.test';

describe('AdminKeyPrompt', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('captures a key through the inline form', () => {
    const onSave = vi.fn();
    render(<AdminKeyPrompt label={LABEL} keyValue={null} onSave={onSave} onClear={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'arm' }));
    expect(onSave).toHaveBeenCalledWith('secret-1');
  });

  it('shows an armed chip with a change action once a key is set', () => {
    const onClear = vi.fn();
    render(<AdminKeyPrompt label={LABEL} keyValue="secret-1" onSave={vi.fn()} onClear={onClear} />);
    expect(screen.getByText(`${LABEL} armed`)).toBeTruthy();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'change' }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('useAdminKey', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('starts from the stored key and persists saves and clears', () => {
    localStorage.setItem(STORAGE_KEY, 'preloaded');
    const { result } = renderHook(() => useAdminKey(STORAGE_KEY));
    expect(result.current.key).toBe('preloaded');

    act(() => result.current.save('  next-key  '));
    expect(result.current.key).toBe('next-key');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('next-key');

    act(() => result.current.clear());
    expect(result.current.key).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores blank submissions', () => {
    const { result } = renderHook(() => useAdminKey(STORAGE_KEY));
    act(() => result.current.save('   '));
    expect(result.current.key).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
