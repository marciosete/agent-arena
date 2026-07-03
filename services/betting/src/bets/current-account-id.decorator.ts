import { UnauthorizedException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '@arena/service-auth';

/** Exported for direct unit testing of the guard-must-run invariant. */
export function accountIdFromRequest(request: AuthenticatedRequest): string {
  if (!request.accountId) {
    throw new UnauthorizedException('Authenticated account required');
  }
  return request.accountId;
}

/**
 * The account the global JwtAuthGuard derived from the Bearer token. This is
 * the ONLY way a handler learns who is betting — the request body carries no
 * accountId, so a punter can never act on another wallet (no IDOR).
 */
export const CurrentAccountId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    accountIdFromRequest(context.switchToHttp().getRequest<AuthenticatedRequest>())
);
