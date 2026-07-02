import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PriceButton } from './PriceButton';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('price button', () => {
  it('flashes green when the price drifts up, then settles', () => {
    vi.useFakeTimers();
    const { rerender } = render(<PriceButton selectionName="Portugal" price={1.8} />);
    rerender(<PriceButton selectionName="Portugal" price={1.95} />);
    const button = screen.getByRole('button', { name: 'Back Portugal at 1.95' });
    expect(button.className).toContain('price-button--up');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(button.className).not.toContain('price-button--up');
  });

  it('flashes red when the price drifts down', () => {
    vi.useFakeTimers();
    const { rerender } = render(<PriceButton selectionName="Portugal" price={1.8} />);
    rerender(<PriceButton selectionName="Portugal" price={1.65} />);
    expect(screen.getByRole('button').className).toContain('price-button--down');
  });

  it('ignores clicks when disabled and fires onPick when enabled', () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <PriceButton selectionName="Portugal" flag="🇵🇹" price={1.8} disabled onPick={onPick} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onPick).not.toHaveBeenCalled();
    rerender(<PriceButton selectionName="Portugal" flag="🇵🇹" price={1.8} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledOnce();
  });
});
