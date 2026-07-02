import { useEffect, useState } from 'react';
import { z } from 'zod';
import { BASE_URLS, FeatureFlagSchema, type FeatureFlag } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import './App.css';

type ServiceKey = keyof typeof BASE_URLS;
type ServiceStatus = 'checking' | 'online' | 'offline';

/** Local defaults from the contracts; deployed builds override via Vercel env. */
const SERVICE_URLS: Record<ServiceKey, string> = {
  pricing: import.meta.env.VITE_PRICING_URL ?? BASE_URLS.pricing,
  betting: import.meta.env.VITE_BETTING_URL ?? BASE_URLS.betting,
  simulator: import.meta.env.VITE_SIMULATOR_URL ?? BASE_URLS.simulator,
  flags: import.meta.env.VITE_FLAGS_URL ?? BASE_URLS.flags,
};

const SERVICES: ServiceKey[] = ['pricing', 'betting', 'simulator', 'flags'];
const POLL_INTERVAL_MS = 5_000;

/** A feature enters the navigation the moment its flag flips on. */
const NAV_ITEMS = [
  { flag: 'punter-markets', label: 'Markets', href: '/markets' },
  { flag: 'punter-bet-slip', label: 'Bet Slip', href: '/bet-slip' },
  { flag: 'punter-my-bets', label: 'My Bets', href: '/my-bets' },
  { flag: 'punter-bracket', label: 'Bracket', href: '/bracket' },
] as const;

async function checkHealth(service: ServiceKey): Promise<ServiceStatus> {
  try {
    const response = await fetch(`${SERVICE_URLS[service]}/health`);
    return response.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function fetchFlags(token: string | undefined): Promise<FeatureFlag[]> {
  try {
    // Flags now require a JWT (all services do); health stays public.
    const response = await fetch(`${SERVICE_URLS.flags}/flags`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      return [];
    }
    return z.array(FeatureFlagSchema).parse(await response.json());
  } catch {
    return [];
  }
}

function useFlags(): FeatureFlag[] {
  const { session } = useAuth();
  const token = session?.token;
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const flagList = await fetchFlags(token);
      if (!cancelled) {
        setFlags(flagList);
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return flags;
}

function useServiceStatuses(): Record<ServiceKey, ServiceStatus> {
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>({
    pricing: 'checking',
    betting: 'checking',
    simulator: 'checking',
    flags: 'checking',
  });

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const entries = await Promise.all(
        SERVICES.map(async (service) => [service, await checkHealth(service)] as const)
      );
      if (!cancelled) {
        setStatuses(Object.fromEntries(entries) as Record<ServiceKey, ServiceStatus>);
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return statuses;
}

function Nav({ flags }: Readonly<{ flags: FeatureFlag[] }>) {
  const enabled = new Set(flags.filter((flag) => flag.enabled).map((flag) => flag.key));
  // Local dev (`npm run dev`) shows every feature so you never flip a production flag just to
  // build. Production builds gate strictly on flags — that's the live-release mechanism.
  // Vite sets `import.meta.env.DEV` true in the dev server, false in production builds.
  const items = NAV_ITEMS.filter((item) => import.meta.env.DEV || enabled.has(item.flag));
  if (items.length === 0) {
    return null;
  }
  return (
    <nav className="nav" aria-label="primary">
      {items.map((item) => (
        <a key={item.flag} className="nav-link" href={item.href}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

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

function Header({ flags }: Readonly<{ flags?: FeatureFlag[] }>) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="home">
        🏆
      </a>
      <div className="topbar-right">
        {flags ? <Nav flags={flags} /> : null}
        <WalletChip />
      </div>
    </header>
  );
}

function HomePage() {
  const flags = useFlags();
  return (
    <div className="app">
      <Header flags={flags} />
      <main className="shell">
        <h1>Road to the Final</h1>
        <p className="sub">The World Cup knockout stage.</p>
      </main>
    </div>
  );
}

function StatusPage() {
  const statuses = useServiceStatuses();
  return (
    <div className="app">
      <Header />
      <main className="shell">
        <h1 className="status-title">Platform Status</h1>
        <ul className="services" aria-label="platform services">
          {SERVICES.map((service) => (
            <li key={service} className="service">
              <span className={`dot ${statuses[service]}`} aria-hidden="true" />
              <span className="service-name">{service}</span>
              <span className="service-status">{statuses[service]}</span>
            </li>
          ))}
        </ul>
        <a className="back-link" href="/">
          ← home
        </a>
      </main>
    </div>
  );
}

export default function App() {
  return globalThis.location.pathname === '/status' ? <StatusPage /> : <HomePage />;
}
