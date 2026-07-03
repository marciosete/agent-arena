import { useAuth } from '@arena/web-auth';
import { ExposureBoard } from './components/ExposureBoard';
import { FinaleControls } from './components/FinaleControls';
import { FlagsPanel } from './components/FlagsPanel';
import { Leaderboard } from './components/Leaderboard';
import { MarketMonitor } from './components/MarketMonitor';
import { SettlementFeed } from './components/SettlementFeed';
import './App.css';

function WalletChip() {
  const { session, logout } = useAuth();
  if (!session) {
    return null;
  }
  return (
    <div className="wallet">
      <span className="wallet-balance">🍩 {session.account.balance.toLocaleString()}</span>
      <span className="wallet-name">{session.account.name}</span>
      <button type="button" className="wallet-logout" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

/**
 * The back office, on one dense screen: release console + risk boards on the
 * left rail, exposure / prices / settlements on the main rail. No routing —
 * traders see everything at once.
 */
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="home">
          📊 <span className="brand-name">Trader Ops</span>
        </a>
        <div className="topbar-right">
          <WalletChip />
        </div>
      </header>
      <main className="console">
        <div className="console-col">
          <FlagsPanel />
          <Leaderboard />
          <FinaleControls />
        </div>
        <div className="console-col">
          <ExposureBoard />
          <MarketMonitor />
          <SettlementFeed />
        </div>
      </main>
    </div>
  );
}
