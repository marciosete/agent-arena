import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Guards the simulator's control plane (reset / play-next / run) — the finale
 * engine. State-changing calls require the x-admin-key header to match
 * SIMULATOR_ADMIN_KEY. Reads (/state, /health) stay public. When no key is
 * configured (local development), control endpoints are open.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminKey = process.env.SIMULATOR_ADMIN_KEY;
    if (!adminKey) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = Buffer.from(String(request.headers['x-admin-key'] ?? ''));
    const expected = Buffer.from(adminKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('x-admin-key header required to control the simulator');
    }
    return true;
  }
}
