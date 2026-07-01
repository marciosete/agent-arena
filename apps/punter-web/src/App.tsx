import { useEffect, useState } from 'react';
import { BASE_URLS } from '@arena/contracts';
import './App.css';

type ServiceKey = keyof typeof BASE_URLS;
type ServiceStatus = 'checking' | 'online' | 'offline';

const SERVICES: ServiceKey[] = ['pricing', 'betting', 'sim'];
const POLL_INTERVAL_MS = 5_000;

async function checkHealth(service: ServiceKey): Promise<ServiceStatus> {
  try {
    const response = await fetch(`${BASE_URLS[service]}/health`);
    return response.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

export default function App() {
  const [statuses, setStatuses] = useState<Record<ServiceKey, ServiceStatus>>({
    pricing: 'checking',
    betting: 'checking',
    sim: 'checking',
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
      <p className="hint">Services light up as the workstreams ship them.</p>
    </main>
  );
}
