'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/ui/cn';

/**
 * Sign in. Core rule 4 is the whole shape of this screen.
 *
 * There is one path in, and it is the same path for everybody. No "I want to compete"
 * option, no role picker, no mention of entering anything — because everyone signs up as
 * a judge and competing is unlocked later by judging. If a future change adds a second
 * button here, that rule has quietly been abandoned.
 *
 * **On the passwordless method.** The prompt pack asks for a magic link. This Neon Auth
 * instance does not have the magic-link plugin enabled — `/sign-in/magic-link` returns
 * 404 — but it does have email OTP, which is the same promise (no password to invent, no
 * password to leak) delivered as a six-digit code instead of a link. A code is arguably
 * better on a phone, where a link opens a second browser and loses the session. See ADR
 * 0006.
 */
type Stage = 'email' | 'code';

export function SignInForm({ next }: { next: string }) {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sendCode = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'sign-in',
      });
      if (result.error) throw new Error(result.error.message ?? 'Could not send the code');
      setStage('code');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
      if (result.error) throw new Error(result.error.message ?? 'That code did not match');
      // A full navigation, not a router push: the session cookie has just changed and the
      // server needs to re-read it to decide where onboarding sends this user next.
      window.location.assign(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That code did not match');
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: next });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not reach Google');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Button variant="outline" size="lg" block disabled={busy} onClick={continueWithGoogle}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-line h-px flex-1" />
        <span className="arena-label">or</span>
        <span className="bg-line h-px flex-1" />
      </div>

      {stage === 'email' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="arena-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
          </label>
          <Button type="submit" variant="primary" size="lg" block disabled={busy || email === ''}>
            {busy ? 'Sending a code' : 'Email me a code'}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="arena-label">Six-digit code</span>
            <input
              // `one-time-code` is what lets a phone offer the code from the notification.
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={cn(fieldClass, 'arena-numeric text-2xl tracking-widest')}
            />
            <span className="text-text-muted text-sm">Sent to {email}</span>
          </label>
          <Button type="submit" variant="primary" size="lg" block disabled={busy || code === ''}>
            {busy ? 'Checking' : 'Continue'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setStage('email');
              setCode('');
              setProblem(null);
            }}
          >
            Use a different email
          </Button>
        </form>
      )}

      {problem !== null && (
        // `alert` so it is announced. Wording stays plain — the copy rules keep the
        // vocabulary of blame out of the one screen where a user is already stuck.
        <p role="alert" className="text-negative text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}

const fieldClass = cn(
  'border-line-strong bg-surface-raised text-text w-full rounded-md border',
  'min-h-[var(--arena-touch-target)] px-3 text-base',
);
