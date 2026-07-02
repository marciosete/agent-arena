import { useAuth } from '@arena/web-auth';
import { ExposureBoard } from './components/ExposureBoard';
import { FinaleControls } from './components/FinaleControls';
import { FlagsPanel } from './components/FlagsPanel';
import { Leaderboard } from './components/Leaderboard';
import { MarketMonitor } from './components/MarketMonitor';
import { SettlementFeed } from './components/SettlementFeed';
import { formatBalance } from './lib/format';
import './App.css';

function WalletChip() {
  const { session, logout } = useAuth();
  if (!session) {
    return null;
  }
  return (
    <div className="wallet">
      <span className="wallet-balance">🍩 {formatMoney(session.account.balance)}</span>
      <span className="wallet-name">{session.account.name}</span>
      <button type="button" className="wallet-logout" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

/**
 * The whole back office on one dense screen — no routing. Each panel owns its
 * polling and degrades to an offline state on its own, so a half-built service
 * elsewhere never takes the console down.
 */
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="home">
          <span className="brand-mark">
            arena<em>//</em>trader
          </span>
          <span className="brand-sub">risk console — road to the final</span>
        </a>
        <div className="topbar-right">
          <WalletChip />
        </div>
      </header>
      <main className="console">
        <ExposureBoard />
        <Leaderboard />
        <FlagsPanel />
        <MarketMonitor />
        <SettlementFeed />
        <FinaleControls />
      </main>
    </div>
  );
}
