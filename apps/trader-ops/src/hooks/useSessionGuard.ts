import { useCallback } from 'react';
import { useAuth } from '@arena/web-auth';
import { ApiError } from '../lib/api';

/**
 * Error handler that ends the session when a request comes back 401: an expired or
 * rejected JWT must send the trader back to `/login` (via `RequireAuth`), not leave
 * the boards frozen on stale liability and prices behind a small error badge. Reads
 * and admin actions share it — a 401 is always an expired session, whereas a 403 on an
 * admin action means the operator's account is not on the admin allowlist.
 */
export function useSessionGuard(): (err: unknown) => void {
  const { logout } = useAuth();
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
    },
    [logout]
  );
}
