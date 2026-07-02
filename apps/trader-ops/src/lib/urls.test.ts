import { describe, expect, it } from 'vitest';
import { BASE_URLS } from '@arena/contracts';
import { SERVICE_URLS } from './urls';

describe('SERVICE_URLS', () => {
  it('falls back to the contract localhost URLs when no VITE_* overrides are set', () => {
    expect(SERVICE_URLS).toEqual(BASE_URLS);
  });
});
