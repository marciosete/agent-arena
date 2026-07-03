import { useCallback } from 'react';
import { useAuth } from '@arena/web-auth';
import { ApiError } from '../lib/api';

/**
 * Poll error handler that ends the session when a read comes back 401: an expired
 * or rejected JWT must send the trader back to `/login` (via `RequireAuth`), not
 * leave the boards frozen on stale liability and prices behind a small error badge.
 * Only for reads — a 401 on an admin-keyed mutation means the admin key was bad
 * (see `useAdminKeyGate`), not the session.
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
