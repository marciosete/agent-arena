import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from './admin.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows a request the JwtAuthGuard flagged as admin', () => {
    expect(guard.canActivate(contextFor({ isAdmin: true }))).toBe(true);
  });

  it('rejects a non-admin request with 403', () => {
    expect(() => guard.canActivate(contextFor({ isAdmin: false }))).toThrow(ForbiddenException);
  });

  it('rejects when the admin flag is absent (defensive)', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });
});
