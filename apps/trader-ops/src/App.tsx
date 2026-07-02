import { useAuth } from '@arena/web-auth';
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

export default function App() {
  const { session } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="home">
          📊
        </a>
        <div className="topbar-right">
          <WalletChip />
        </div>
      </header>
      <main className="shell">
        <h1>Trader Ops</h1>
        <p className="sub">Signed in as {session?.account.name ?? '—'}.</p>
      </main>
    </div>
  );
}
