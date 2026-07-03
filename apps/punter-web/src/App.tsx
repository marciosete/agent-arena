import { useEffect, useRef, type RefObject } from 'react';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import { SERVICE_URLS } from './config';
import { FLAGS, FlagsProvider, useFlagOn } from './flags';
import { Header } from './Header';
import { useBalanceRefresh } from './hooks';
import { HomePage } from './pages/HomePage';
import { MarketsPage } from './pages/MarketsPage';
import { MyBetsPage } from './pages/MyBetsPage';
import { StatusPage } from './pages/StatusPage';
import { replacePath, usePathname } from './router';
import { BetSlipDrawer, SlipProvider } from './slip';
import './App.css';

/** The authenticated shell: sticky header, routed page, bet-slip drawer over anything. */
export default function App() {
  const pathname = usePathname();
  useBalanceRefresh();
  return (
    <div className="app">
      <Header />
      <CurrentPage pathname={pathname} />
      <BetSlipDrawer />
    </div>
  );
}

/**
 * Routes behind login: `/` (the bracket) · `/markets` · `/my-bets`. A dark flag
 * means its page is absent — unknown or dark paths land on home, never a stub.
 */
function CurrentPage({ pathname }: Readonly<{ pathname: string }>) {
  const marketsOn = useFlagOn(FLAGS.markets);
  const myBetsOn = useFlagOn(FLAGS.myBets);
  if (pathname === '/markets' && marketsOn) {
    return <MarketsPage />;
  }
  if (pathname === '/my-bets' && myBetsOn) {
    return <MyBetsPage />;
  }
  return <HomePage />;
}

/** Full composition — what `main.tsx` mounts. Auth is pre-built: we live behind it. */
export function Root() {
  const pathname = usePathname();
  // RequireAuth bounces the URL through /login while the stored session restores,
  // which would eat deep links (/markets, /my-bets). Remember where the punter
  // actually landed and put it back once, right after the session exists.
  const initialPathRef = useRef<string | null>(globalThis.location.pathname);

  // /status reports outages via the public /health endpoints — it must stay
  // reachable when betting (and therefore login) is down, so it lives outside
  // the auth gate.
  if (pathname === '/status') {
    return (
      <div className="app">
        <StatusPage />
      </div>
    );
  }
  return (
    <AuthProvider bettingUrl={SERVICE_URLS.betting}>
      <RequireAuth>
        <FlagsProvider>
          <SlipProvider>
            <App />
            <DeepLinkRestore initialPathRef={initialPathRef} />
          </SlipProvider>
        </FlagsProvider>
      </RequireAuth>
    </AuthProvider>
  );
}

function DeepLinkRestore({
  initialPathRef,
}: Readonly<{ initialPathRef: RefObject<string | null> }>) {
  useEffect(() => {
    const target = initialPathRef.current;
    initialPathRef.current = null; // one restore per page load
    if (target && target !== '/login' && globalThis.location.pathname !== target) {
      replacePath(target);
    }
  }, [initialPathRef]);
  return null;
}
