import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';
import { styles } from './styles';

// Bounded quantifiers (RFC-ish length caps) keep this linear — no ReDoS backtracking.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/;
const CODE_RE = /^\d{6}$/;

type Step = 'email' | 'code';

/**
 * The `/login` screen: passwordless email + one-time code.
 * Step 1 collects an email and requests a code; step 2 collects the 6-digit
 * code (plus an optional nickname for new accounts) and verifies it. On success
 * it simply sets the session — routing/redirects are the app's concern.
 */
export function LoginPage() {
  const { requestOtp, verify } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(): Promise<void> {
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setCode('');
      setStep('code');
    } catch {
      setError('We could not send a code right now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  function onEmailSubmit(event: FormEvent): void {
    event.preventDefault();
    void sendCode();
  }

  function onCodeSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!CODE_RE.test(code.trim())) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setBusy(true);
    verify(email.trim(), code.trim(), nickname)
      .catch(() => setError("That code didn't work — check it or resend."))
      .finally(() => setBusy(false));
  }

  function changeEmail(): void {
    setStep('email');
    setError(null);
    setCode('');
  }

  return (
    <main style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.title}>Sign in to Arena</h1>
        <p style={styles.subtitle}>
          {step === 'email'
            ? 'Enter your email and we’ll send you a one-time code.'
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {step === 'email' ? (
          <form onSubmit={onEmailSubmit} noValidate>
            <label style={styles.label} htmlFor="arena-email">
              Email
            </label>
            <input
              id="arena-email"
              type="email"
              autoComplete="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" style={styles.primary} disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={onCodeSubmit} noValidate>
            <label style={styles.label} htmlFor="arena-code">
              6-digit code
            </label>
            <input
              id="arena-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              style={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <label style={styles.label} htmlFor="arena-nickname">
              Nickname (new accounts)
            </label>
            <input
              id="arena-nickname"
              type="text"
              maxLength={50}
              style={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button type="submit" style={styles.primary} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            <div style={styles.linkRow}>
              <button type="button" style={styles.link} onClick={() => void sendCode()}>
                Resend code
              </button>
              <button type="button" style={styles.link} onClick={changeEmail}>
                Change email
              </button>
            </div>
          </form>
        )}

        {error ? (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
