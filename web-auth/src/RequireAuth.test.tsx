import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequireAuth } from './RequireAuth';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));

const SPIES = {
  requestOtp: vi.fn(),
  verify: vi.fn(),
  logout: vi.fn(),
  refreshBalance: vi.fn(),
};

const SESSION = {
  token: 'a.b.c',
  account: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'punter@example.com',
    name: 'Ada',
    balance: 10_000,
    isBot: false,
    createdAt: '2026-07-01T10:00:00.000Z',
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
});

describe('RequireAuth', () => {
  it('renders the login page and routes to /login when logged out', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      ...SPIES,
    } as unknown as ReturnType<typeof useAuth>);
    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>
    );
    expect(screen.queryByText('secret content')).toBeNull();
    expect(screen.getByText('Sign in to Arena')).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
  });

  it('renders children when a session exists', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: SESSION,
      ...SPIES,
    } as unknown as ReturnType<typeof useAuth>);
    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>
    );
    expect(screen.getByText('secret content')).toBeTruthy();
    expect(screen.queryByText('Sign in to Arena')).toBeNull();
  });
});
