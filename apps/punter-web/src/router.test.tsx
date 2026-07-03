import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, navigate, replacePath, usePathname } from './router';

function Probe() {
  const pathname = usePathname();
  return <output>{pathname}</output>;
}

afterEach(() => {
  cleanup();
  globalThis.history.pushState({}, '', '/');
});

describe('usePathname + navigate', () => {
  it('re-renders on navigate and replacePath', () => {
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('/');
    act(() => navigate('/markets'));
    expect(screen.getByRole('status').textContent).toBe('/markets');
    expect(globalThis.location.pathname).toBe('/markets');
    act(() => replacePath('/my-bets'));
    expect(screen.getByRole('status').textContent).toBe('/my-bets');
  });

  it('re-clicking the current page does not stack history entries', () => {
    render(<Probe />);
    act(() => navigate('/markets'));
    const depth = globalThis.history.length;
    act(() => navigate('/markets'));
    expect(globalThis.history.length).toBe(depth);
  });

  it('follows browser back/forward (popstate)', () => {
    render(<Probe />);
    act(() => {
      globalThis.history.pushState({}, '', '/markets');
      globalThis.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('status').textContent).toBe('/markets');
  });

  it('catches up with a URL that moved before subscription', () => {
    globalThis.history.pushState({}, '', '/status');
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('/status');
  });
});

describe('Link', () => {
  it('routes client-side on a plain click', () => {
    render(
      <>
        <Link to="/markets">Markets</Link>
        <Probe />
      </>
    );
    fireEvent.click(screen.getByText('Markets'));
    expect(globalThis.location.pathname).toBe('/markets');
    expect(screen.getByRole('status').textContent).toBe('/markets');
  });

  it('leaves modified clicks (⌘/ctrl) to the browser', () => {
    render(<Link to="/markets">Markets</Link>);
    fireEvent.click(screen.getByText('Markets'), { metaKey: true });
    expect(globalThis.location.pathname).toBe('/');
  });
});
