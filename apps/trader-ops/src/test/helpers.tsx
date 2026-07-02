import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { AuthProvider, RequireAuth } from '@arena/web-auth';

export const TEST_BETTING_URL = 'https://betting.test';

/** Seed the localStorage session that `@arena/web-auth` restores on mount. */
export function seedSession(): void {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (payload: unknown): string =>
    btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  localStorage.setItem('arena.token', `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', exp })}.sig`);
  localStorage.setItem(
    'arena.account',
    JSON.stringify({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'trader@example.com',
      name: 'Nadia',
      balance: 10_000,
      isBot: false,
      createdAt: '2026-07-01T10:00:00.000Z',
    })
  );
}

/**
 * Render UI exactly as the real app wraps it: AuthProvider + RequireAuth with
 * a seeded session. RequireAuth mounts children only after the session is
 * restored (an effect), so first assertions must `await screen.find*`/waitFor —
 * and every fetch a child makes is guaranteed to carry the Bearer token.
 */
export function renderWithAuth(ui: ReactElement): RenderResult {
  seedSession();
  return render(
    <AuthProvider bettingUrl={TEST_BETTING_URL}>
      <RequireAuth>{ui}</RequireAuth>
    </AuthProvider>
  );
}

/** JSON `Response` builder for stubbed fetch routes. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
