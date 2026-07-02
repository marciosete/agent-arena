import { UnauthorizedException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '@arena/service-auth';

/**
 * The account behind the session token, as attached by the global
 * JwtAuthGuard. This is the ONLY place a write handler may get an account id
 * from — never the request body (no IDOR).
 */
export function sessionAccountId(request: AuthenticatedRequest): string {
  if (!request.accountId) {
    throw new UnauthorizedException('Bearer token required');
  }
  return request.accountId;
}

export const SessionAccountId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    sessionAccountId(context.switchToHttp().getRequest<AuthenticatedRequest>())
);
