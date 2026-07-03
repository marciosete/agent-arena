import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminKeyPrompt } from './AdminKeyPrompt';

function renderPrompt(onSubmit = vi.fn()) {
  render(<AdminKeyPrompt label="flag flips" keyName="FLAGS_ADMIN_KEY" onSubmit={onSubmit} />);
  return onSubmit;
}

describe('AdminKeyPrompt', () => {
  afterEach(cleanup);

  it('names what the key unlocks and which env var holds it', () => {
    renderPrompt();
    expect(screen.getByText(/Admin key required for flag flips/)).toBeTruthy();
    expect(screen.getByText('FLAGS_ADMIN_KEY')).toBeTruthy();
  });

  it('cannot submit while empty or whitespace-only', () => {
    const onSubmit = renderPrompt();
    const button = screen.getByRole('button', { name: 'Unlock' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('paste admin key'), {
      target: { value: '   ' },
    });
    expect(button.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed key and clears the field', () => {
    const onSubmit = renderPrompt();
    const input = screen.getByPlaceholderText('paste admin key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  sesame  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onSubmit).toHaveBeenCalledWith('sesame');
    expect(input.value).toBe('');
  });

  it('masks the key as it is typed', () => {
    renderPrompt();
    const input = screen.getByPlaceholderText('paste admin key') as HTMLInputElement;
    expect(input.type).toBe('password');
  });
});
