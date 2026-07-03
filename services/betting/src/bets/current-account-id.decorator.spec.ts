import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { accountIdFromRequest } from './current-account-id.decorator';

describe('accountIdFromRequest', () => {
  it('returns the account id the JwtAuthGuard attached to the request', () => {
    expect(accountIdFromRequest({ headers: {}, accountId: 'acc-1' })).toBe('acc-1');
  });

  it('refuses a request the guard never authenticated', () => {
    expect(() => accountIdFromRequest({ headers: {} })).toThrow(UnauthorizedException);
  });
});
