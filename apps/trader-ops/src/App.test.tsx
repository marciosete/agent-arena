import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthProvider } from '@arena/web-auth';
import App from './App';

function seedSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

function renderApp() {
  return render(
    <AuthProvider bettingUrl="http://betting.test">
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the console shell with the wallet chip for a signed-in user', () => {
    seedSession();
    renderApp();
    expect(screen.getByText('Trader Ops')).toBeTruthy();
    expect(screen.getByText('Nadia')).toBeTruthy();
    expect(screen.getByText(/Signed in as Nadia/)).toBeTruthy();
  });

  it('renders a placeholder and no wallet chip when logged out', () => {
    renderApp();
    expect(screen.getByText('Trader Ops')).toBeTruthy();
    expect(screen.getByText(/Signed in as —/)).toBeTruthy();
    expect(screen.queryByText('Nadia')).toBeNull();
  });
});
