import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the event brand', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<App />);
    expect(screen.getByText('Road to the Final')).toBeTruthy();
  });

  it('shows every service online when health checks succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('online')).toHaveLength(3));
  });

  it('shows services offline when health checks are rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(3));
  });

  it('shows services offline when health checks respond unhealthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('offline')).toHaveLength(3));
  });
});
