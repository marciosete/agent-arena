import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import { SERVICE_URLS } from '../lib/config';

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const TEST_TOKEN_SUB = '11111111-1111-4111-8111-111111111111';

/** Seed a valid-looking session into localStorage so `AuthProvider` restores it. */
export function seedSession(name = 'Nadia'): void {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  localStorage.setItem(
    'arena.token',
    `${b64url({ alg: 'HS256' })}.${b64url({ sub: TEST_TOKEN_SUB, exp })}.sig`
  );
  localStorage.setItem(
    'arena.account',
    JSON.stringify({
      id: TEST_TOKEN_SUB,
      email: 'trader@example.com',
      name,
      balance: 10_000,
      isBot: false,
      createdAt: '2026-07-01T10:00:00.000Z',
    })
  );
}

/**
 * Render `ui` exactly as production mounts it: inside `AuthProvider` + `RequireAuth`
 * with a seeded session, so children only mount once the Bearer token is live and
 * every request they fire carries it.
 */
export function renderAuthed(ui: ReactNode): RenderResult {
  seedSession();
  return render(
    <AuthProvider bettingUrl={SERVICE_URLS.betting}>
      <RequireAuth>{ui}</RequireAuth>
    </AuthProvider>
  );
}

/** Render `ui` with no session — `RequireAuth` should show the login page instead. */
export function renderLoggedOut(ui: ReactNode): RenderResult {
  return render(
    <AuthProvider bettingUrl={SERVICE_URLS.betting}>
      <RequireAuth>{ui}</RequireAuth>
    </AuthProvider>
  );
}

/** A JSON `Response` for fetch stubs. */
export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
