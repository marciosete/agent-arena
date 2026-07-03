import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from '@arena/web-auth';
import { Header } from './Header';
import { SlipProvider } from './slip';
import { arenaAfterEach, seedSession, stubFetch } from './__tests__/harness';

afterEach(arenaAfterEach);

function renderHeader({ withSession = true } = {}) {
  if (withSession) {
    seedSession();
  }
  stubFetch({});
  return render(
    <AuthProvider bettingUrl="http://localhost:4002">
      <SlipProvider>
        <Header />
      </SlipProvider>
    </AuthProvider>
  );
}

describe('header chrome', () => {
  it('renders the wordmark as the home link', async () => {
    renderHeader();
    const brand = screen.getByLabelText('home');
    expect(brand.textContent).toBe('ROAD TO THE FINAL');
    expect(brand.getAttribute('href')).toBe('/');
  });

  it('shows no wallet chip while logged out (login screen owns that state)', () => {
    renderHeader({ withSession: false });
    expect(screen.queryByText(/🍩/)).toBeNull();
  });

  it('closes the profile menu via its backdrop', async () => {
    renderHeader();
    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    expect(screen.getByRole('menu', { name: 'profile' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menu', { name: 'profile' })).toBeNull();
  });

  it('toggles the menu from the chip itself', async () => {
    renderHeader();
    const chip = await screen.findByRole('button', { name: /Ana/ });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole('menu', { name: 'profile' })).toBeNull();
  });
});
