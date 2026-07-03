import type { ReactNode } from 'react';
import { fmtClock } from '../lib/format';

export interface PanelMeta {
  updatedAt: number | null;
  error: string | null;
}

export interface PanelProps {
  title: string;
  /** Poll health — renders the live dot + "updated HH:MM:SS" so traders trust the data. */
  meta?: PanelMeta;
  /** Extra header controls (e.g. a change-key button). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

function MetaBadge({ meta }: Readonly<{ meta: PanelMeta }>) {
  if (meta.error) {
    return (
      <span className="panel-meta is-error" title={meta.error}>
        <span className="live-dot is-error" aria-hidden="true" />
        {meta.error}
      </span>
    );
  }
  return (
    <span className="panel-meta">
      <span className="live-dot" aria-hidden="true" />
      {meta.updatedAt ? `updated ${fmtClock(meta.updatedAt)}` : 'loading…'}
    </span>
  );
}

/** Shared chrome for every board: title, live indicator, header actions. */
export function Panel({ title, meta, actions, className, children }: Readonly<PanelProps>) {
  return (
    <section className={className ? `panel ${className}` : 'panel'} aria-label={title}>
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        <div className="panel-tools">
          {actions}
          {meta && <MetaBadge meta={meta} />}
        </div>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
