import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

/**
 * A hand-rolled pathname router (no dependencies). `navigate` pushes history and
 * pings subscribers; `usePathname` also listens to popstate so Back/Forward work.
 */
const NAVIGATE_EVENT = 'arena:navigate';

export function navigate(path: string): void {
  if (globalThis.location.pathname === path) {
    return; // re-clicking the current page must not stack history entries
  }
  globalThis.history.pushState({}, '', path);
  globalThis.scrollTo(0, 0);
  globalThis.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Replace the current entry (used to restore a deep link without growing history). */
export function replacePath(path: string): void {
  globalThis.history.replaceState({}, '', path);
  globalThis.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => globalThis.location.pathname);

  useEffect(() => {
    const sync = (): void => setPathname(globalThis.location.pathname);
    globalThis.addEventListener('popstate', sync);
    globalThis.addEventListener(NAVIGATE_EVENT, sync);
    // The URL may have moved between first render and subscription (RequireAuth
    // bounces it through /login while the stored session restores) — catch up.
    sync();
    return () => {
      globalThis.removeEventListener('popstate', sync);
      globalThis.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  return pathname;
}

export interface LinkProps {
  to: string;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** An anchor that routes client-side; modified clicks (⌘/ctrl/shift) keep browser behaviour. */
export function Link({ to, children, ...rest }: Readonly<LinkProps>) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
