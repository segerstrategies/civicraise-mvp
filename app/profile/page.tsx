'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('citizen');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setMessage('Supabase is not configured.');
          return;
        }

        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError) {
          setMessage(authError.message);
          return;
        }
        if (!currentUser) return;

        setUser(currentUser);
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name,role')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          setMessage(error.message);
          return;
        }
        setName(data?.full_name || '');
        setRole(data?.role || 'citizen');
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    setSaving(true);
    setMessage('');
    try {
      const supabase = createClient();
      if (!supabase) {
        setMessage('Supabase is not configured.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: name.trim() || null })
        .eq('id', user.id);

      setMessage(error ? error.message : 'Profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="narrow"><h1>Your profile</h1><p className="muted">Loading profile…</p></div>;
  }

  if (!user) {
    return (
      <div className="narrow">
        <h1>Your profile</h1>
        <p className="muted">{message || 'Sign in to manage your profile.'}</p>
        <a className="btn primary" href="/auth">Sign in</a>
      </div>
    );
  }

  return (
    <>
      <div className="eyebrow">PROFILE</div>
      <h1>Your profile</h1>
      <p className="muted">Update your interests, location, and contact details in <a href="/onboarding">onboarding preferences</a>.</p>
      <form className="card form narrow" onSubmit={save}>
        <label>
          Full name
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </label>
        <label>
          Role
          <input value={role} readOnly aria-readonly="true" />
        </label>
        <button className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </form>
    </>
  );
}
