import { useCallback } from 'react';
import { POLL, SERVICE_URLS, type ServiceKey } from '../config';
import { usePoll } from '../hooks';
import { Link } from '../router';

type ServiceStatus = 'checking' | 'online' | 'offline';

const SERVICES: ServiceKey[] = ['pricing', 'betting', 'simulator', 'flags'];

/** `GET /health` is the one deliberately public endpoint — no token here. */
async function checkHealth(service: ServiceKey): Promise<ServiceStatus> {
  try {
    const response = await fetch(`${SERVICE_URLS[service]}/health`);
    return response.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function checkAll(): Promise<Record<ServiceKey, ServiceStatus>> {
  const entries = await Promise.all(
    SERVICES.map(async (service) => [service, await checkHealth(service)] as const)
  );
  return Object.fromEntries(entries) as Record<ServiceKey, ServiceStatus>;
}

export function StatusPage() {
  const load = useCallback(() => checkAll(), []);
  const statuses = usePoll(load, POLL.health);

  return (
    <main className="shell">
      <h1 className="status-title">Platform Status</h1>
      <ul className="services" aria-label="platform services">
        {SERVICES.map((service) => {
          const status = statuses?.[service] ?? 'checking';
          return (
            <li key={service} className="service">
              <span className={`dot ${status}`} aria-hidden="true" />
              <span className="service-name">{service}</span>
              <span className="service-status">{status}</span>
            </li>
          );
        })}
      </ul>
      <Link className="back-link" to="/">
        ← home
      </Link>
    </main>
  );
}
