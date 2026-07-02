import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { BearerAuthGuard, type AuthenticatedRequest } from './bearer-auth.guard';
import { signToken } from './token';

const ACCOUNT_ID = 'account-77';

function contextFor(request: Partial<AuthenticatedRequest>): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context: ctx, request };
}

describe('BearerAuthGuard', () => {
  it('accepts a valid token and attaches the account id to the request', () => {
    const { context, request } = contextFor({
      headers: { authorization: `Bearer ${signToken(ACCOUNT_ID)}` },
    });
    expect(new BearerAuthGuard().canActivate(context)).toBe(true);
    expect(request.accountId).toBe(ACCOUNT_ID);
  });

  it('rejects a missing Authorization header', () => {
    const { context } = contextFor({ headers: {} });
    expect(() => new BearerAuthGuard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme', () => {
    const { context } = contextFor({
      headers: { authorization: `Basic ${signToken(ACCOUNT_ID)}` },
    });
    expect(() => new BearerAuthGuard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid/tampered token', () => {
    const { context } = contextFor({ headers: { authorization: 'Bearer not-a-real-token' } });
    expect(() => new BearerAuthGuard().canActivate(context)).toThrow(UnauthorizedException);
  });
});
