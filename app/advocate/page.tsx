'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

export default function Advocate() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [firm, setFirm] = useState('');
  const [registration, setRegistration] = useState('');
  const [bio, setBio] = useState('');
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
          .from('advocate_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          setMessage(error.message);
          return;
        }
        setProfile(data);
        setFirm(data?.firm_name || '');
        setRegistration(data?.registration_status || '');
        setBio(data?.bio || '');
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your advocate profile.');
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

    const firmName = firm.trim();
    if (!firmName) {
      setMessage('Enter a firm or lobbyist name.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const supabase = createClient();
      if (!supabase) {
        setMessage('Supabase is not configured.');
        return;
      }

      const { data, error } = await supabase
        .from('advocate_profiles')
        .upsert({
          id: user.id,
          firm_name: firmName,
          bio: bio.trim() || null,
          registration_status: registration.trim() || null,
          verification_status: profile?.verification_status || 'pending',
        }, { onConflict: 'id' })
        .select('*')
        .single();

      if (error) {
        setMessage(error.message);
      } else {
        setProfile(data);
        setMessage('Advocate profile saved.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your advocate profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="narrow"><h1>Advocate profile</h1><p className="muted">Loading profile…</p></div>;
  }

  if (!user) {
    return (
      <div className="narrow">
        <h1>Advocate profile</h1>
        <p className="muted">{message || 'Sign in to create an advocate profile.'}</p>
        <Link href="/auth" className="btn primary">Sign in</Link>
      </div>
    );
  }

  return (
    <>
      <div className="eyebrow">ADVOCATE PROFILE</div>
      <h1>Advocate profile</h1>
      <div className="grid two">
        <form className="card form" onSubmit={save}>
          <label>
            Firm / name
            <input value={firm} onChange={(event) => setFirm(event.target.value)} required />
          </label>
          <label>
            Federal registration status
            <input
              value={registration}
              onChange={(event) => setRegistration(event.target.value)}
              placeholder="e.g. LDA registered"
            />
          </label>
          <label>
            Bio
            <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} />
          </label>
          <button className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
        </form>
        <div className="card">
          <h2>Advocate tools</h2>
          <p className="muted">Verification status: {profile?.verification_status || 'pending'}</p>
          <div className="actions">
            <Link href="/advocate/dashboard" className="btn primary">View lobbyist dashboard</Link>
            <Link href="/advocate/rfps" className="btn">View open RFPs</Link>
          </div>
        </div>
      </div>
    </>
  );
}
