import type { ReactNode } from 'react';
import { formatClock } from '../lib/format';

export interface PanelProps {
  /** Console title, e.g. "EXPOSURE / LIABILITY". */
  title: string;
  /** Where the numbers come from, e.g. "betting :4002 /exposure". */
  source: string;
  /** Grid slot in the App console layout. */
  area: 'exposure' | 'leaderboard' | 'flags' | 'markets' | 'feed' | 'finale';
  lastUpdatedAt: string | null;
  error: string | null;
  /** Header-right controls (admin key chip, action buttons…). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Shared terminal-panel chrome: title strip, data source, live/offline status
 * light and a stale-data warning. Every surface on the console wears this so
 * traders read freshness the same way everywhere.
 */
export function Panel({
  title,
  source,
  area,
  lastUpdatedAt,
  error,
  actions,
  children,
}: Readonly<PanelProps>) {
  let statusClass = 'is-wait';
  let statusLabel = 'CONNECTING';
  if (error !== null) {
    statusClass = 'is-down';
    statusLabel = 'OFFLINE';
  } else if (lastUpdatedAt !== null) {
    statusClass = 'is-live';
    statusLabel = `LIVE ${formatClock(lastUpdatedAt)}`;
  }
  return (
    <section className={`panel area-${area}`} aria-label={title}>
      <header className="panel-head">
        <div className="panel-id">
          <h2 className="panel-title">{title}</h2>
          <span className="panel-src">{source}</span>
        </div>
        <div className="panel-tools">
          {actions}
          <span className={`panel-status ${statusClass}`}>{statusLabel}</span>
        </div>
      </header>
      {error !== null && (
        <p className="panel-error" role="alert">
          feed error: {error} — retrying{lastUpdatedAt !== null ? ', showing last good data' : ''}
        </p>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
