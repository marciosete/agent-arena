import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { FlagsWriteGuard } from './flags-write.guard';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('FlagsWriteGuard', () => {
  afterEach(() => {
    delete process.env.FLAGS_ADMIN_KEY;
  });

  it('allows writes when no admin key is configured (local dev)', () => {
    delete process.env.FLAGS_ADMIN_KEY;
    expect(new FlagsWriteGuard().canActivate(contextWithHeaders({}))).toBe(true);
  });

  it('allows writes with the correct admin key', () => {
    process.env.FLAGS_ADMIN_KEY = 'secret-key';
    const context = contextWithHeaders({ 'x-admin-key': 'secret-key' });
    expect(new FlagsWriteGuard().canActivate(context)).toBe(true);
  });

  it('rejects writes with a wrong key', () => {
    process.env.FLAGS_ADMIN_KEY = 'secret-key';
    const context = contextWithHeaders({ 'x-admin-key': 'wrong' });
    expect(() => new FlagsWriteGuard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects writes with no key header', () => {
    process.env.FLAGS_ADMIN_KEY = 'secret-key';
    expect(() => new FlagsWriteGuard().canActivate(contextWithHeaders({}))).toThrow(
      UnauthorizedException
    );
  });
});
