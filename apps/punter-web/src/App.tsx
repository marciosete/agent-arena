import { useEffect, useState } from 'react';
import { z } from 'zod';
import { BASE_URLS, FeatureFlagSchema, type FeatureFlag } from '@arena/contracts';
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

async function fetchFlags(): Promise<FeatureFlag[]> {
  try {
    const response = await fetch(`${SERVICE_URLS.flags}/flags`);
    if (!response.ok) {
      return [];
    }
    return z.array(FeatureFlagSchema).parse(await response.json());
  } catch {
    return [];
  }
}

function useFlags(): FeatureFlag[] {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const flagList = await fetchFlags();
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
  }, []);

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

function Nav({ flags }: { flags: FeatureFlag[] }) {
  const enabled = new Set(flags.filter((flag) => flag.enabled).map((flag) => flag.key));
  const items = NAV_ITEMS.filter((item) => enabled.has(item.flag));
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

function HomePage() {
  const flags = useFlags();
  return (
    <main className="shell">
      <Nav flags={flags} />
      <h1>Road to the Final</h1>
      <p className="sub">The World Cup knockout stage.</p>
    </main>
  );
}

function StatusPage() {
  const statuses = useServiceStatuses();
  return (
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
  );
}

export default function App() {
  return window.location.pathname === '/status' ? <StatusPage /> : <HomePage />;
}
