'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase-browser';

function getSafeNextPath() {
  const requested = new URLSearchParams(window.location.search).get('next');
  if (!requested?.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) return null;

  const destination = new URL(requested, window.location.origin);
  return destination.origin === window.location.origin
    ? destination.pathname + destination.search + destination.hash
    : null;
}

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setMessage('');
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setMessage('Supabase is not configured. Add the NEXT_PUBLIC variables.');
        return;
      }

      const nextPath = getSafeNextPath();
      const callbackUrl = new URL('/auth/callback', location.origin);
      if (nextPath) callbackUrl.searchParams.set('next', nextPath);

      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callbackUrl.toString(),
          },
        });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === 'signin') {
        if (nextPath) {
          location.href = nextPath;
          return;
        }

        const userId = result.data.user?.id;
        if (!userId) {
          setMessage('Sign-in succeeded, but CivicRaise could not load your account. Try again.');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('onboarding_completed_at')
          .eq('id', userId)
          .maybeSingle();

        if (profileError) {
          setMessage(profileError.message);
          return;
        }

        location.href = profile?.onboarding_completed_at ? '/dashboard' : '/onboarding';
        return;
      }

      if (result.data.session) {
        location.href = nextPath || '/onboarding';
        return;
      }

      setMessage('Account created. Check your email to confirm your account, then you can finish onboarding.');
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((current) => current === 'signin' ? 'signup' : 'signin');
    setMessage('');
  }

  const signingIn = mode === 'signin';

  return (
    <div className="narrow">
      <div className="eyebrow">CIVICRAISE ACCOUNT</div>
      <h1>{signingIn ? 'Sign in' : 'Create account'}</h1>
      <form className="card form" onSubmit={submit}>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
            disabled={isSubmitting}
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete={signingIn ? 'current-password' : 'new-password'}
            minLength={6}
            required
            disabled={isSubmitting}
          />
        </label>
        <button className="btn primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Working…' : signingIn ? 'Sign in' : 'Create account'}
        </button>
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </form>
      <button className="link-button" type="button" onClick={toggleMode} disabled={isSubmitting}>
        {signingIn ? 'Need an account? Create one' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
