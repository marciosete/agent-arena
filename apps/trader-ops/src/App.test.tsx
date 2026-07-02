import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the trader console shell', () => {
    render(<App />);
    expect(screen.getByText('Trader Ops')).toBeTruthy();
  });
});
