import {
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingHttpHeaders } from 'node:http';
import { verifyTokenClaims } from './token';

/** Reflector metadata key marking a handler/controller as publicly accessible. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler or whole controller as public, exempting it from
 * {@link JwtAuthGuard}. Use on login/health endpoints that must be reachable
 * without a session token:
 *
 * ```ts
 * @Public()
 * @Post('auth/request-otp')
 * requestOtp() { ... }
 * ```
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** The underlying HTTP request enriched with the authenticated identity. */
export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  accountId?: string;
  /** true when the token carried the admin claim — read by {@link AdminGuard}. */
  isAdmin?: boolean;
}

/**
 * Global session guard: reads `Authorization: Bearer <jwt>`, verifies the
 * signature + expiry with {@link verifyToken}, and attaches
 * `request.accountId`. Downstream handlers derive the account from the token,
 * never from the body (no IDOR). Missing or invalid tokens are rejected with
 * 401. Handlers/controllers marked with {@link Public} bypass the check, so the
 * guard is safe to register globally (`APP_GUARD`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = String(request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token required');
    }

    const claims = verifyTokenClaims(token);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    request.accountId = claims.sub;
    request.isAdmin = claims.admin;
    return true;
  }
}
