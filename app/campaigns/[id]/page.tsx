'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

const formatMoney = (amount: number) => amount.toLocaleString(undefined, {
  style: 'currency',
  currency: 'USD',
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function Campaign() {
  const { id } = useParams<{ id: string }>();
  const [amount, setAmount] = useState('5');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [campaign, setCampaign] = useState<any>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [raised, setRaised] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaign() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setLoadError('Supabase is not configured. Connect the app to load campaign details.');
          return;
        }

        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;
        setSignedIn(Boolean(authData.user));

        const { data: bySlug, error: slugError } = await supabase
          .from('campaigns')
          .select('*,campaign_milestones(*)')
          .eq('slug', id)
          .maybeSingle();

        if (slugError) {
          setLoadError(slugError.message);
          return;
        }

        let foundCampaign = bySlug;
        if (!foundCampaign && isUuid(id)) {
          const { data: byId, error: idError } = await supabase
            .from('campaigns')
            .select('*,campaign_milestones(*)')
            .eq('id', id)
            .maybeSingle();

          if (idError) {
            setLoadError(idError.message);
            return;
          }
          foundCampaign = byId;
        }

        if (cancelled) return;
        if (!foundCampaign) {
          setLoadError('This campaign could not be found.');
          return;
        }

        setCampaign(foundCampaign);
        setRaised(Number(foundCampaign.raised_cents || 0));
        try {
          const stored = JSON.parse(window.localStorage.getItem('civicraise:saved-campaigns') || '[]');
          setSaved(Array.isArray(stored) && stored.includes(String(foundCampaign.id || foundCampaign.slug)));
        } catch {
          // The campaign page remains usable if storage is unavailable.
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load this campaign.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCampaign();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function pledge() {
    if (!campaign || submitting) return;

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/test-pledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, amount: Number(selectedAmount) }),
      });
      const result = await response.json().catch(() => ({}));

      setMessage(result.message || (response.ok ? 'Pledge recorded.' : 'Pledge could not be recorded.'));
      if (response.ok && result.campaign) {
        setRaised(Number(result.campaign.raised_cents || 0));
      }
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <><div className="eyebrow">CAMPAIGN</div><h1>Loading campaign…</h1></>;
  }

  if (loadError || !campaign) {
    return (
      <>
        <div className="eyebrow">CAMPAIGN</div>
        <h1>Campaign unavailable</h1>
        <div className="card">
          <p className="muted" role="alert">{loadError || 'This campaign could not be found.'}</p>
          <Link className="btn" href="/campaigns">Back to campaigns</Link>
        </div>
      </>
    );
  }

  const goal = Number(campaign.goal_cents || 0);
  const progress = goal > 0 ? Math.min(100, raised / goal * 100) : 0;
  const milestones = [...(campaign.campaign_milestones || [])]
    .sort((left: any, right: any) => left.sequence - right.sequence);
  const acceptingPledges = ['PUBLISHED', 'FUNDING'].includes(campaign.status);
  const selectedAmount = Number(customAmount || amount);
  const remaining = Math.max(0, goal - raised);
  const campaignKey = String(campaign.id || campaign.slug);

  function toggleSaved() {
    try {
      const stored = JSON.parse(window.localStorage.getItem('civicraise:saved-campaigns') || '[]');
      const ids = Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [];
      const next = saved ? ids.filter((value) => value !== campaignKey) : [...new Set([...ids, campaignKey])];
      window.localStorage.setItem('civicraise:saved-campaigns', JSON.stringify(next));
      setSaved(!saved);
      setMessage(!saved ? 'Campaign saved to your list.' : 'Campaign removed from your saved list.');
    } catch {
      setMessage('Saved campaigns are unavailable in this browser.');
    }
  }

  async function shareCampaign() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: campaign.title, url });
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else { setMessage('Copy this campaign link: ' + url); return; }
      setMessage('Campaign link shared or copied.');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Copy this campaign link: ' + url);
    }
  }

  return (
    <>
      <div className="eyebrow">{campaign.bill} · {campaign.status}</div>
      <h1>{campaign.title}</h1>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow">FUNDING STATUS</div>
        <div className="metric">{formatMoney(raised / 100)}</div>
        <p className="muted">of {formatMoney(goal / 100)} target · {Math.round(progress)}% funded · {remaining ? formatMoney(remaining / 100) + ' to go' : 'goal reached'}</p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Campaign funding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div style={{ width: progress + '%' }} />
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Campaign objective</h2>
          <p>{campaign.description}</p>
          <div className="actions">
            <button type="button" className="btn" aria-pressed={saved} onClick={toggleSaved}>{saved ? 'Saved campaign' : 'Save campaign'}</button>
            <button type="button" className="btn" onClick={() => void shareCampaign()}>Share campaign</button>
            <Link className="btn" href={`/campaigns/${campaign.slug || campaign.id}/updates`}>Updates and events</Link>
          </div>
          {Array.isArray(campaign.issue_areas) && campaign.issue_areas.length > 0 && (
            <p className="muted">Issue areas: {campaign.issue_areas.join(' · ')}</p>
          )}
          <h3>Milestones</h3>
          {milestones.length === 0
            ? <p className="muted">No milestones have been added.</p>
            : milestones.map((milestone: any) => (
              <div key={milestone.id} style={{ marginBottom: 14 }}>
                <p>{milestone.sequence}. {milestone.name} · {formatMoney(Number(milestone.amount_cents || 0) / 100)} ({goal ? Math.round(Number(milestone.amount_cents || 0) / goal * 100) : 0}% of goal)</p>
                {milestone.due_at && <p className="muted">Target date: {new Date(milestone.due_at).toLocaleDateString()}</p>}
              </div>
            ))}
        </div>

        <div className="card">
          <h3>Make a pledge</h3>
          {!acceptingPledges ? (
            <p className="muted">Pledges are closed for this campaign (status: {campaign.status}).</p>
          ) : signedIn ? (
            <>
              <label>
                Suggested pledge
                <select value={customAmount ? 'custom' : amount} onChange={(event) => { setCustomAmount(''); setAmount(event.target.value); }} disabled={submitting}>
                  <option value="0.99">$0.99</option>
                  <option value="5">$5</option>
                  <option value="20">$20</option>
                  <option value="100">$100</option>
                  <option value="custom">Custom amount</option>
                </select>
              </label>
              {(customAmount || amount === 'custom') && (
                <label>
                  Custom amount (USD)
                  <input type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} disabled={submitting} placeholder="Enter an amount" />
                </label>
              )}
              <p className="muted">Your {formatMoney(selectedAmount || 0)} pledge would add {goal ? (selectedAmount / (goal / 100) * 100).toFixed(2) : '0.00'} percentage points toward this campaign goal. Demo only; no real payment is processed.</p>
              <button
                className="btn primary"
                onClick={pledge}
                style={{ marginTop: 12 }}
                disabled={submitting || !Number.isFinite(selectedAmount) || selectedAmount <= 0}
              >
                {submitting ? 'Recording pledge…' : 'Pledge ' + formatMoney(selectedAmount)}
              </button>
            </>
          ) : (
            <>
              <p className="muted">Sign in before making a pledge.</p>
              <Link href="/auth" className="btn primary">Sign in</Link>
            </>
          )}
          {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
        </div>
      </div>
    </>
  );
}
