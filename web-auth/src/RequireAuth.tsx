import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { LoginPage } from './LoginPage';

export interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Gate an entire app behind login. When there is no session (logged out, or the
 * stored token had already expired and the provider dropped it), it points the
 * URL at `/login` and renders the {@link LoginPage}; otherwise it renders the app.
 */
export function RequireAuth({ children }: Readonly<RequireAuthProps>) {
  const { session } = useAuth();

  useEffect(() => {
    const path = globalThis.location?.pathname;
    if (!session && path !== '/login') {
      globalThis.history.pushState({}, '', '/login');
    } else if (session && path === '/login') {
      // After a successful sign-in, get the address bar off /login (replace, not push,
      // so Back doesn't return to the login screen).
      globalThis.history.replaceState({}, '', '/');
    }
  }, [session]);

  if (!session) {
    return <LoginPage />;
  }
  return <>{children}</>;
}
