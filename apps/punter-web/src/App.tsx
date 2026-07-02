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

export default function App() {
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>({
    pricing: 'checking',
    betting: 'checking',
    simulator: 'checking',
    flags: 'checking',
  });
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const [entries, flagList] = await Promise.all([
        Promise.all(
          SERVICES.map(async (service) => [service, await checkHealth(service)] as const)
        ),
        fetchFlags(),
      ]);
      if (!cancelled) {
        setStatuses(Object.fromEntries(entries) as Record<ServiceKey, ServiceStatus>);
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

  return (
    <main className="shell">
      <p className="kicker">Sportsbet × Claude · Agent Arena</p>
      <h1>Road to the Final</h1>
      <p className="sub">
        A World Cup sportsbook, built live by one engineer and a fleet of agents.
      </p>
      <ul className="services" aria-label="platform services">
        {SERVICES.map((service) => (
          <li key={service} className="service">
            <span className={`dot ${statuses[service]}`} aria-hidden="true" />
            <span className="service-name">{service}</span>
            <span className="service-status">{statuses[service]}</span>
          </li>
        ))}
      </ul>
      {flags.length > 0 && (
        <ul className="flags" aria-label="feature flags">
          {flags.map((flag) => (
            <li key={flag.key} className={`flag ${flag.enabled ? 'is-live' : 'is-dark'}`}>
              <span className="flag-key">{flag.key}</span>
              <span className="flag-state">{flag.enabled ? 'live' : 'dark'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Services light up as the workstreams ship them. Features go live when their flag flips.
      </p>
    </main>
  );
}
