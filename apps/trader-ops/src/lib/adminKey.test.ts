import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAdminKey, loadAdminKey, saveAdminKey } from './adminKey';

const STORAGE_KEY = 'trader.adminKey.test';

describe('adminKey storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips a saved key', () => {
    saveAdminKey(STORAGE_KEY, 'k1');
    expect(loadAdminKey(STORAGE_KEY)).toBe('k1');
  });

  it('returns null when nothing is stored or the value is blank', () => {
    expect(loadAdminKey(STORAGE_KEY)).toBeNull();
    localStorage.setItem(STORAGE_KEY, '   ');
    expect(loadAdminKey(STORAGE_KEY)).toBeNull();
  });

  it('clears a stored key', () => {
    saveAdminKey(STORAGE_KEY, 'k1');
    clearAdminKey(STORAGE_KEY);
    expect(loadAdminKey(STORAGE_KEY)).toBeNull();
  });

  it('swallows storage failures (private mode) instead of crashing the console', () => {
    const boom = () => {
      throw new Error('quota');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(() => saveAdminKey(STORAGE_KEY, 'k1')).not.toThrow();
    expect(loadAdminKey(STORAGE_KEY)).toBeNull();
    expect(() => clearAdminKey(STORAGE_KEY)).not.toThrow();
  });
});
