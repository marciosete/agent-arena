import type { CSSProperties } from 'react';

/**
 * Minimal dark styling so the login screen looks like a premium sportsbook out
 * of the box. Apps own the final theme — these are intentionally low-opinion
 * inline styles with no external CSS or class-name coupling.
 */
export const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(1200px 600px at 50% -10%, #10203a 0%, #0a0f1a 60%)',
    color: '#e8edf5',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '360px',
    background: '#111826',
    border: '1px solid #1f2b40',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: '0 0 20px',
    fontSize: '14px',
    color: '#8ba0bf',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#8ba0bf',
    margin: '14px 0 6px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    fontSize: '15px',
    color: '#e8edf5',
    background: '#0c1220',
    border: '1px solid #26344c',
    borderRadius: '10px',
    outline: 'none',
  },
  primary: {
    width: '100%',
    marginTop: '18px',
    padding: '12px 14px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#04121f',
    background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  linkRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '16px',
    gap: '12px',
  },
  link: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#7dd3fc',
    fontSize: '13px',
    cursor: 'pointer',
  },
  error: {
    marginTop: '14px',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#fecaca',
    background: 'rgba(220, 38, 38, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    borderRadius: '10px',
  },
};
