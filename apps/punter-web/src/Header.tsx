import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@arena/web-auth';
import { useFeature } from './flags';
import { Link } from './router';
import { useSlip } from './slip';

function ProfileMenu({ onClose }: Readonly<{ onClose: () => void }>) {
  const { session, logout } = useAuth();
  if (!session) {
    return null;
  }
  const signOut = () => {
    onClose();
    logout();
  };
  return (
    <div className="profile-menu" role="menu" aria-label="profile">
      <p className="profile-name">{session.account.name}</p>
      <p className="profile-balance">
        🍩 {session.account.balance.toLocaleString()} <span>donut dollars</span>
      </p>
      <button type="button" className="profile-action" role="menuitem" onClick={signOut}>
        Switch punter
      </button>
      <button type="button" className="profile-action" role="menuitem" onClick={signOut}>
        Log out
      </button>
    </div>
  );
}

function WalletChip() {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  if (!session) {
    return null;
  }
  return (
    <div className="wallet-root" ref={rootRef}>
      <button
        type="button"
        className="wallet"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="wallet-balance">🍩 {session.account.balance.toLocaleString()}</span>
        <span className="wallet-dot" aria-hidden="true">
          ·
        </span>
        <span className="wallet-name">{session.account.name}</span>
        <span className="wallet-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen ? <ProfileMenu onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}

function Nav() {
  const marketsOn = useFeature('punter-markets');
  const slipOn = useFeature('punter-bet-slip');
  const myBetsOn = useFeature('punter-my-bets');
  const { toggleSlip } = useSlip();

  if (!marketsOn && !slipOn && !myBetsOn) {
    return null;
  }
  return (
    <nav className="nav" aria-label="primary">
      {marketsOn ? (
        <Link className="nav-link" to="/markets">
          Markets
        </Link>
      ) : null}
      {slipOn ? (
        <button type="button" className="nav-link nav-button" onClick={toggleSlip}>
          Bet Slip
        </button>
      ) : null}
      {myBetsOn ? (
        <Link className="nav-link" to="/my-bets">
          My Bets
        </Link>
      ) : null}
    </nav>
  );
}

/** Sticky top bar: wordmark → home, flag-gated nav, wallet chip → profile menu. */
export function Header() {
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="home">
        <span className="brand-mark" aria-hidden="true">
          🏆
        </span>
        <span className="brand-word">Road to the Final</span>
      </Link>
      <Nav />
      <WalletChip />
    </header>
  );
}
