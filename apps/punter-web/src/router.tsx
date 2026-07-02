import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

/**
 * A palm-sized client-side router: pathname state + pushState navigation.
 * The app has four routes and no params — a routing library would be freight.
 */

interface RouterValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [path, setPath] = useState(() => globalThis.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(globalThis.location.pathname);
    globalThis.addEventListener('popstate', onPop);
    return () => globalThis.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (globalThis.location.pathname !== to) {
      globalThis.history.pushState({}, '', to);
    }
    setPath(to);
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter() must be used within a <RouterProvider>.');
  }
  return ctx;
}

export interface LinkProps {
  to: string;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** An anchor that navigates client-side but keeps native behaviour for modified clicks. */
export function Link({ to, className, 'aria-label': ariaLabel, children }: Readonly<LinkProps>) {
  const { navigate } = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </a>
  );
}
