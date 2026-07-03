import { useState } from 'react';
import { useAuth } from '@arena/web-auth';
import { FLAGS, useFlagOn } from './flags';
import { formatDonuts } from './format';
import { Link } from './router';
import { useSlip } from './slip';

/**
 * Sticky top bar: wordmark → home, flag-gated nav (items appear as flags flip),
 * and the wallet chip (🍩 balance · name → profile menu) on the right.
 */
export function Header() {
  const marketsOn = useFlagOn(FLAGS.markets);
  const slipOn = useFlagOn(FLAGS.betSlip);
  const myBetsOn = useFlagOn(FLAGS.myBets);
  const { openEmpty } = useSlip();

  const hasNav = marketsOn || slipOn || myBetsOn;
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="home">
        ROAD TO THE FINAL
      </Link>
      {hasNav ? (
        <nav className="nav" aria-label="primary">
          {marketsOn ? (
            <Link to="/markets" className="nav-link">
              Markets
            </Link>
          ) : null}
          {slipOn ? (
            <button type="button" className="nav-link nav-btn" onClick={openEmpty}>
              Bet Slip
            </button>
          ) : null}
          {myBetsOn ? (
            <Link to="/my-bets" className="nav-link">
              My Bets
            </Link>
          ) : null}
        </nav>
      ) : null}
      <WalletChip />
    </header>
  );
}

/** Balance + nickname; opens the profile menu (Switch punter / Log out). */
function WalletChip() {
  const { session, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) {
    return null;
  }
  const { account } = session;
  return (
    <div className="wallet-wrap">
      <button
        type="button"
        className="wallet"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="wallet-balance">{formatDonuts(account.balance)}</span>
        <span className="wallet-sep">·</span>
        <span className="wallet-name">{account.name}</span>
        <span className="wallet-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen ? (
        <>
          <button
            type="button"
            className="menu-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="profile-menu" role="menu" aria-label="profile">
            <div className="profile-id">
              <strong>{account.name}</strong>
              <span className="profile-balance">{formatDonuts(account.balance)}</span>
              {account.email ? <span className="profile-email">{account.email}</span> : null}
            </div>
            {/* Both are sign-out only: the account and balance persist server-side. */}
            <button type="button" role="menuitem" className="menu-item" onClick={logout}>
              Switch punter
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={logout}>
              Log out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
