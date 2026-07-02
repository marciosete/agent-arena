import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyToken } from './token';

/** Express request enriched with the authenticated account id. */
export interface AuthenticatedRequest extends Request {
  accountId?: string;
}

/**
 * Authenticates a session: reads `Authorization: Bearer <token>`, verifies the
 * signature + expiry, and attaches `request.accountId`. Downstream handlers
 * derive the account from the token, never from the body (no IDOR). Missing or
 * invalid tokens are rejected with 401.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = String(request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token required');
    }

    const accountId = verifyToken(token);
    if (!accountId) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    request.accountId = accountId;
    return true;
  }
}
