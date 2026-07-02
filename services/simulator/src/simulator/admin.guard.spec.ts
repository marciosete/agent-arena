import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminGuard } from './admin.guard';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  afterEach(() => {
    delete process.env.SIMULATOR_ADMIN_KEY;
  });

  it('allows control when no admin key is configured (local dev)', () => {
    delete process.env.SIMULATOR_ADMIN_KEY;
    expect(new AdminGuard().canActivate(contextWithHeaders({}))).toBe(true);
  });

  it('allows control with the correct admin key', () => {
    process.env.SIMULATOR_ADMIN_KEY = 'secret-key';
    expect(new AdminGuard().canActivate(contextWithHeaders({ 'x-admin-key': 'secret-key' }))).toBe(
      true
    );
  });

  it('rejects control with a wrong key (403 — authenticated but not authorized)', () => {
    process.env.SIMULATOR_ADMIN_KEY = 'secret-key';
    expect(() =>
      new AdminGuard().canActivate(contextWithHeaders({ 'x-admin-key': 'wrong' }))
    ).toThrow(ForbiddenException);
  });

  it('rejects control with no key header (403)', () => {
    process.env.SIMULATOR_ADMIN_KEY = 'secret-key';
    expect(() => new AdminGuard().canActivate(contextWithHeaders({}))).toThrow(ForbiddenException);
  });
});
