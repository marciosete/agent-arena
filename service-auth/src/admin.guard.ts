import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Route guard for admin-only actions — reset, settlement, flag flips, bot
 * provisioning. It runs AFTER the global {@link JwtAuthGuard} (registered as an
 * `APP_GUARD`, so it executes first), which verifies the token and sets
 * `request.isAdmin` from the token's `admin` claim. That claim is true for
 * allowlisted operator logins (betting stamps it from `ADMIN_EMAILS`) and for
 * backend service tokens — and it's unforgeable, since only the holder of
 * `SESSION_SECRET` can sign a token.
 *
 * No shared keys, no `x-admin-key` headers: authority is identity, carried in
 * the token. Apply with `@UseGuards(AdminGuard)`. Non-admins get 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.isAdmin === true) {
      return true;
    }
    throw new ForbiddenException('Admin privileges required for this action');
  }
}
