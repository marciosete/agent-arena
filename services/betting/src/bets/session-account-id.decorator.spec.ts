import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { sessionAccountId } from './session-account-id.decorator';

describe('sessionAccountId', () => {
  it('returns the account id the JwtAuthGuard attached to the request', () => {
    expect(sessionAccountId({ headers: {}, accountId: 'acc-1' })).toBe('acc-1');
  });

  it('rejects a request the guard never authenticated (defence in depth)', () => {
    expect(() => sessionAccountId({ headers: {} })).toThrow(UnauthorizedException);
  });
});
