import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Write-guard for flag mutations. Reads stay public; writes require the
 * x-admin-key header to match FLAGS_ADMIN_KEY. When no key is configured
 * (local development), writes are open.
 */
@Injectable()
export class FlagsWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminKey = process.env.FLAGS_ADMIN_KEY;
    if (!adminKey) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = Buffer.from(String(request.headers['x-admin-key'] ?? ''));
    const expected = Buffer.from(adminKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('x-admin-key header required to modify flags');
    }
    return true;
  }
}
