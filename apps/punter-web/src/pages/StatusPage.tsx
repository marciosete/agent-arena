import { useCallback } from 'react';
import { checkHealth } from '../api';
import { POLL_MS, SERVICE_URLS, SERVICES, type ServiceKey } from '../config';
import { usePoll } from '../hooks';
import { Link } from '../router';

type Health = Record<ServiceKey, boolean>;

/** `/status`: public health dots for every service (`GET /health` needs no token). */
export function StatusPage() {
  const health = usePoll(
    useCallback(async (): Promise<Health> => {
      const entries = await Promise.all(
        SERVICES.map(
          async (service) => [service, await checkHealth(SERVICE_URLS[service])] as const
        )
      );
      return Object.fromEntries(entries) as Health;
    }, []),
    POLL_MS.health
  );

  return (
    <main className="page page-center">
      <h1 className="page-title">Platform Status</h1>
      <ul className="services" aria-label="platform services">
        {SERVICES.map((service) => {
          const status = statusOf(health, service);
          return (
            <li key={service} className="service">
              <span className={`dot ${status}`} aria-hidden="true" />
              <span className="service-name">{service}</span>
              <span className="service-status">{status}</span>
            </li>
          );
        })}
      </ul>
      <Link to="/" className="back-link">
        ← home
      </Link>
    </main>
  );
}

function statusOf(health: Health | null, service: ServiceKey): 'checking' | 'online' | 'offline' {
  if (health === null) {
    return 'checking';
  }
  return health[service] ? 'online' : 'offline';
}
