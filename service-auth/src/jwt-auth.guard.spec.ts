import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, JwtAuthGuard, Public, type AuthenticatedRequest } from './jwt-auth.guard';
import { signToken } from './token';

const ACCOUNT_ID = 'account-77';

function bearer(accountId: string): string {
  return `Bearer ${signToken(accountId)}`;
}

class PublicMethodController {
  @Public()
  open(): void {}

  guarded(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

const noop = (): void => undefined;

/** Builds a minimal ExecutionContext around a request, route handler, and class. */
function contextFor(
  request: Partial<AuthenticatedRequest>,
  handler: object = noop,
  cls: object = class Anonymous {}
): { context: ExecutionContext; request: Partial<AuthenticatedRequest> } {
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
  return { context, request };
}

function guard(): JwtAuthGuard {
  return new JwtAuthGuard(new Reflector());
}

describe('JwtAuthGuard', () => {
  it('accepts a valid token and attaches the account id to the request', () => {
    const { context, request } = contextFor({ headers: { authorization: bearer(ACCOUNT_ID) } });
    expect(guard().canActivate(context)).toBe(true);
    expect(request.accountId).toBe(ACCOUNT_ID);
  });

  it('rejects a missing Authorization header with 401', () => {
    const { context } = contextFor({ headers: {} });
    expect(() => guard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme with 401', () => {
    const { context } = contextFor({
      headers: { authorization: `Basic ${signToken(ACCOUNT_ID)}` },
    });
    expect(() => guard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid/tampered token with 401', () => {
    const { context } = contextFor({ headers: { authorization: 'Bearer not-a-real-token' } });
    expect(() => guard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('bypasses enforcement for a handler marked @Public (no token required)', () => {
    const { context, request } = contextFor(
      { headers: {} },
      PublicMethodController.prototype.open,
      PublicMethodController
    );
    expect(guard().canActivate(context)).toBe(true);
    expect(request.accountId).toBeUndefined();
  });

  it('still enforces auth for a non-@Public handler on a controller that has public siblings', () => {
    const { context } = contextFor(
      { headers: {} },
      PublicMethodController.prototype.guarded,
      PublicMethodController
    );
    expect(() => guard().canActivate(context)).toThrow(UnauthorizedException);
  });

  it('bypasses enforcement when the whole controller is marked @Public', () => {
    const { context } = contextFor(
      { headers: {} },
      PublicController.prototype.handler,
      PublicController
    );
    expect(guard().canActivate(context)).toBe(true);
  });

  it('Public() sets the IS_PUBLIC_KEY metadata that the guard reads', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, PublicMethodController.prototype.open)).toBe(true);
    expect(reflector.get(IS_PUBLIC_KEY, PublicMethodController.prototype.guarded)).toBeUndefined();
  });
});
