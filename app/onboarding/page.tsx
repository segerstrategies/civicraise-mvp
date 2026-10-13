'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const interestAreas = [
  'Agriculture & food systems',
  'Climate & energy',
  'Civil rights',
  'Education',
  'Health care',
  'Housing',
  'Immigration',
  'Jobs & labor',
  'Technology & privacy',
  'Taxes & small business',
  'Transportation & infrastructure',
  'Veterans',
  'Other federal issues',
];

const states = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'],
] as const;

type ProfileForm = {
  fullName: string;
  phone: string;
  city: string;
  state: string;
  postalCode: string;
  interestAreas: string[];
};

const emptyForm: ProfileForm = {
  fullName: '',
  phone: '',
  city: '',
  state: '',
  postalCode: '',
  interestAreas: [],
};

export default function Onboarding() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setMessage('CivicRaise is not connected to its account service. Try again later.');
          setMessageIsError(true);
          return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError) throw authError;
        if (!user) return;

        setUserId(user.id);
        setEmail(user.email ?? '');

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name,phone,city,state,postal_code,interest_areas')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;
        if (profileError) throw profileError;
        if (!profile) {
          setMessage('We could not find your CivicRaise profile. Sign out and back in, then try again.');
          setMessageIsError(true);
          return;
        }

        setForm({
          fullName: profile.full_name === user.email ? '' : (profile.full_name ?? ''),
          phone: profile.phone ?? '',
          city: profile.city ?? '',
          state: profile.state ?? '',
          postalCode: profile.postal_code ?? '',
          interestAreas: Array.isArray(profile.interest_areas) ? profile.interest_areas : [],
        });
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your onboarding details.');
          setMessageIsError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleInterest(area: string) {
    setForm((current) => ({
      ...current,
      interestAreas: current.interestAreas.includes(area)
        ? current.interestAreas.filter((selected) => selected !== area)
        : [...current.interestAreas, area],
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;

    if (!email.trim()) {
      setMessage('A valid email address is required for your CivicRaise account.');
      setMessageIsError(true);
      return;
    }

    setSaving(true);
    setMessage('');
    setMessageIsError(false);

    try {
      const supabase = createClient();
      if (!supabase) throw new Error('CivicRaise is not connected to its account service. Try again later.');

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: form.fullName.trim() || null,
          phone: form.phone.trim() || null,
          city: form.city.trim() || null,
          state: form.state || null,
          postal_code: form.postalCode.trim() || null,
          interest_areas: form.interestAreas,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('We could not save your profile. Refresh the page and try again.');

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your onboarding details.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="narrow"><h1>Welcome to CivicRaise</h1><p className="muted">Loading your account…</p></div>;
  }

  if (!userId) {
    return (
      <div className="narrow">
        <div className="eyebrow">GETTING STARTED</div>
        <h1>Welcome to CivicRaise</h1>
        <p className="muted">Sign in to set up your interests and location.</p>
        {message && <p className="onboarding-error" role="alert">{message}</p>}
        <a className="btn primary" href="/auth">Sign in</a>
      </div>
    );
  }

  return (
    <div className="onboarding-form">
      <div className="onboarding-intro">
        <div className="eyebrow">GETTING STARTED · STEP 1 OF 1</div>
        <h1>Make CivicRaise yours</h1>
        <p className="muted">Tell us what issues matter to you and where you are. We’ll use this information to make your CivicRaise experience more relevant.</p>
      </div>

      <form className="card form" onSubmit={save}>
        <label>
          Email <span aria-hidden="true">*</span>
          <input type="email" value={email} autoComplete="email" readOnly required aria-describedby="onboarding-email-help" />
          <span className="form-help" id="onboarding-email-help">Required for your account and used to sign in.</span>
        </label>

        <label>
          Full name <span className="form-help">Optional</span>
          <input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} autoComplete="name" maxLength={120} />
        </label>

        <label>
          Phone number <span className="form-help">Optional</span>
          <input type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" maxLength={40} />
        </label>

        <fieldset className="onboarding-section">
          <legend>Where are you located? <span className="form-help">Optional</span></legend>
          <div className="location-fields">
            <label>
              City
              <input value={form.city} onChange={(event) => update('city', event.target.value)} autoComplete="address-level2" maxLength={100} />
            </label>
            <label>
              State or territory
              <select value={form.state} onChange={(event) => update('state', event.target.value)} autoComplete="address-level1">
                <option value="">Select</option>
                {states.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
              </select>
            </label>
            <label>
              ZIP code
              <input value={form.postalCode} onChange={(event) => update('postalCode', event.target.value)} autoComplete="postal-code" inputMode="numeric" maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" title="Enter a five-digit ZIP code, optionally followed by a four-digit extension." />
            </label>
          </div>
        </fieldset>

        <fieldset className="onboarding-section">
          <legend>Which issues interest you? <span className="form-help">Select any that apply</span></legend>
          <div className="interest-options">
            {interestAreas.map((area) => (
              <label className="interest-option" key={area}>
                <input type="checkbox" checked={form.interestAreas.includes(area)} onChange={() => toggleInterest(area)} />
                <span>{area}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {message && <p className={messageIsError ? 'onboarding-status onboarding-error' : 'onboarding-status onboarding-success'} role={messageIsError ? 'alert' : 'status'} aria-live="polite">{message}</p>}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
