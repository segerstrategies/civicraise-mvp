'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function AuthControls() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setMessage('Could not verify your session. Refresh the page to try again.');
        setEmail(data.user?.email ?? null);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMessage('Could not verify your session. Refresh the page to try again.');
        setReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setEmail(session?.user?.email ?? null);
      setMessage('');
      setReady(true);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setMessage('');

    try {
      const supabase = createClient();
      if (!supabase) {
        setMessage('Supabase is not configured.');
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.assign('/');
    } catch {
      setMessage('Unable to sign out. Check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }

  if (!ready) return <span className="session" aria-label="Checking sign-in status">Checking session…</span>;

  return (
    <>
      {email ? (
        <>
          <span className="session">{email}</span>
          <button className="link-button" type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      ) : (
        <Link href="/auth" className="btn">Sign in</Link>
      )}
      {message && <span className="session" role="alert">{message}</span>}
    </>
  );
}
