import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));

function mockAuth() {
  const requestOtp = vi.fn().mockResolvedValue(undefined);
  const verify = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    requestOtp,
    verify,
    logout: vi.fn(),
    refreshBalance: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  return { requestOtp, verify };
}

async function toCodeStep(requestOtp: ReturnType<typeof vi.fn>) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.click(screen.getByText('Send code'));
  await waitFor(() => expect(requestOtp).toHaveBeenCalled());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('rejects an invalid email and requests no code', () => {
    const { requestOtp } = mockAuth();
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Send code'));
    expect(screen.getByRole('alert').textContent).toContain('valid email');
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('sends a code for a valid email and advances to the code step', async () => {
    const { requestOtp } = mockAuth();
    render(<LoginPage />);
    await toCodeStep(requestOtp);
    expect(requestOtp).toHaveBeenCalledWith('a@b.com');
    expect(screen.getByLabelText('6-digit code')).toBeTruthy();
    expect(screen.getByLabelText('Nickname (new accounts)')).toBeTruthy();
  });

  it('shows an error when sending the code fails', async () => {
    const { requestOtp } = mockAuth();
    requestOtp.mockRejectedValueOnce(new Error('down'));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByText('Send code'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not send'));
  });

  it('verifies a valid code with the nickname', async () => {
    const { requestOtp, verify } = mockAuth();
    render(<LoginPage />);
    await toCodeStep(requestOtp);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('Nickname (new accounts)'), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByText('Verify & continue'));
    await waitFor(() => expect(verify).toHaveBeenCalledWith('a@b.com', '123456', 'Ada'));
  });

  it('rejects an invalid code without calling verify', async () => {
    const { requestOtp, verify } = mockAuth();
    render(<LoginPage />);
    await toCodeStep(requestOtp);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Verify & continue'));
    expect(screen.getByRole('alert').textContent).toContain('6-digit code');
    expect(verify).not.toHaveBeenCalled();
  });

  it('surfaces a verify failure', async () => {
    const { requestOtp, verify } = mockAuth();
    verify.mockRejectedValueOnce(new Error('bad'));
    render(<LoginPage />);
    await toCodeStep(requestOtp);
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & continue'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("didn't work"));
  });

  it('can resend the code and change the email', async () => {
    const { requestOtp } = mockAuth();
    render(<LoginPage />);
    await toCodeStep(requestOtp);
    fireEvent.click(screen.getByText('Resend code'));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('Change email'));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});
