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

  it('points builders at the workstream spec', () => {
    render(<App />);
    expect(screen.getByText(/docs\/specs\/trader-ops\.md/)).toBeTruthy();
  });
});
