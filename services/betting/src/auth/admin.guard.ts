import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Guards admin-only betting endpoints (bot provisioning, settlement). Callers
 * must present an x-admin-key header matching BETTING_ADMIN_KEY. When no key is
 * configured (local development), the endpoints are open. Mirrors the
 * simulator/flags admin guards.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminKey = process.env.BETTING_ADMIN_KEY;
    if (!adminKey) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = Buffer.from(String(request.headers['x-admin-key'] ?? ''));
    const expected = Buffer.from(adminKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('x-admin-key header required for this endpoint');
    }
    return true;
  }
}
