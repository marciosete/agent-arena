import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminGuard } from './admin.guard';

const ADMIN_KEY = 'betting-secret';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  afterEach(() => {
    delete process.env.BETTING_ADMIN_KEY;
  });

  it('allows access when no admin key is configured (local dev)', () => {
    delete process.env.BETTING_ADMIN_KEY;
    expect(new AdminGuard().canActivate(contextWithHeaders({}))).toBe(true);
  });

  it('allows access with the correct admin key', () => {
    process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
    expect(new AdminGuard().canActivate(contextWithHeaders({ 'x-admin-key': ADMIN_KEY }))).toBe(
      true
    );
  });

  it('rejects a wrong key', () => {
    process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
    expect(() =>
      new AdminGuard().canActivate(contextWithHeaders({ 'x-admin-key': 'nope' }))
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing key header', () => {
    process.env.BETTING_ADMIN_KEY = ADMIN_KEY;
    expect(() => new AdminGuard().canActivate(contextWithHeaders({}))).toThrow(
      UnauthorizedException
    );
  });
});
