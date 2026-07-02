import { useEffect, type ReactNode } from 'react';
import type { FlagKey } from '@arena/contracts';
import { BetSlip } from './components/BetSlip';
import { POLL } from './config';
import { FlagsProvider, useFeature, useFlagsState } from './flags';
import { Header } from './Header';
import { useBalanceHeartbeat } from './hooks';
import { HomePage } from './pages/HomePage';
import { MarketsPage } from './pages/MarketsPage';
import { MyBetsPage } from './pages/MyBetsPage';
import { StatusPage } from './pages/StatusPage';
import { RouterProvider, useRouter } from './router';
import { SlipProvider } from './slip';
import './App.css';

/**
 * Route-level flag gate. Dark means absent: once flags have loaded, a dark
 * route bounces home. Until they load (or in dev, which bypasses flags) the
 * route holds rather than bouncing a legitimate deep link.
 */
function Gate({ flag, children }: Readonly<{ flag: FlagKey; children: ReactNode }>) {
  const on = useFeature(flag);
  const { ready } = useFlagsState();
  const { navigate } = useRouter();
  const decided = ready || import.meta.env.DEV;

  useEffect(() => {
    if (decided && !on) {
      navigate('/');
    }
  }, [decided, on, navigate]);

  if (!decided) {
    return (
      <main className="shell">
        <p className="page-empty">Loading…</p>
      </main>
    );
  }
  return on ? <>{children}</> : null;
}

function Routes() {
  const { path } = useRouter();
  switch (path) {
    case '/status':
      return <StatusPage />;
    case '/markets':
      return (
        <Gate flag="punter-markets">
          <MarketsPage />
        </Gate>
      );
    case '/my-bets':
      return (
        <Gate flag="punter-my-bets">
          <MyBetsPage />
        </Gate>
      );
    default:
      return <HomePage />;
  }
}

function Shell() {
  useBalanceHeartbeat(POLL.balance);
  return (
    <div className="app">
      <Header />
      <Routes />
      <BetSlip />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <FlagsProvider>
        <SlipProvider>
          <Shell />
        </SlipProvider>
      </FlagsProvider>
    </RouterProvider>
  );
}
