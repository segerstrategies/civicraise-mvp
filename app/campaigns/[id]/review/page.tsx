'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setLoadError('Supabase is not configured.');
          return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError) {
          setLoadError(authError.message);
          return;
        }
        if (!user) {
          setLoadError('Sign in to review campaign deliverables.');
          return;
        }
        setSignedIn(true);

        const { data: campaign, error: campaignError } = await supabase
          .from('campaigns')
          .select('id,title,bill')
          .eq('slug', id)
          .maybeSingle();

        if (cancelled) return;
        if (campaignError) {
          setLoadError(campaignError.message);
          return;
        }
        if (!campaign) {
          setLoadError('This campaign could not be found.');
          return;
        }

        const { data, error } = await supabase
          .from('deliverables')
          .select('id,description,status,submitted_at,campaign_milestones(name,amount_cents),contracts(rfps(campaign_id,title))')
          .eq('contracts.rfps.campaign_id', campaign.id)
          .order('submitted_at', { ascending: false });

        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          return;
        }

        const rows = data || [];
        setDeliverables(rows);
        setSelectedId((current) => rows.some((row: any) => row.id === current) ? current : rows[0]?.id || '');
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load deliverables for review.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReview();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function dispute() {
    const selected = deliverables.find((item) => item.id === selectedId);
    if (!selected || !reason.trim() || submitting) return;

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliverableId: selected.id, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.message || (response.ok ? 'Dispute recorded.' : 'Dispute could not be raised.'));

      if (response.ok) {
        setReason('');
        setDeliverables((current) => current.map((item) =>
          item.id === selected.id ? { ...item, status: 'DISPUTED' } : item
        ));
      }
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selected = deliverables.find((item) => item.id === selectedId);

  if (loading) {
    return <><div className="eyebrow">BACKER REVIEW</div><h1>Loading deliverables…</h1></>;
  }

  if (!signedIn) {
    return (
      <>
        <div className="eyebrow">BACKER REVIEW</div>
        <h1>Review deliverables</h1>
        <div className="card">
          <p className="muted" role="alert">{loadError || 'Sign in to review campaign deliverables.'}</p>
          <Link href="/auth" className="btn primary">Sign in</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">BACKER REVIEW · {id}</div>
      <h1>Review deliverables</h1>
      {loadError && <div className="notice" role="alert">{loadError}</div>}

      {deliverables.length === 0 ? (
        <div className="card">
          <h2>No deliverables are available yet</h2>
          <p className="muted">When an advocate submits work for this campaign, it will appear here for review.</p>
          <Link href="/ratification" className="btn">Go to ratification</Link>
        </div>
      ) : (
        <div className="grid two">
          <div className="card form">
            <h2>Submitted work</h2>
            <label>
              Deliverable
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {deliverables.map((deliverable) => (
                  <option key={deliverable.id} value={deliverable.id}>
                    {deliverable.campaign_milestones?.name || 'Milestone'} · {deliverable.status}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <h3>{selected.campaign_milestones?.name || 'Campaign deliverable'}</h3>
                <p>{selected.description}</p>
                <p>Status: <strong>{String(selected.status).replace(/_/g, ' ')}</strong></p>
                {selected.submitted_at && (
                  <p className="muted">Submitted {new Date(selected.submitted_at).toLocaleString()}</p>
                )}
                <Link className="btn primary" href="/ratification">Continue to ratification</Link>
              </>
            )}
          </div>

          <div className="card form">
            <h2>Challenge a deliverable</h2>
            <p className="muted">
              Use this only when submitted work needs formal review. A dispute freezes the campaign until admin resolution.
            </p>
            <label>
              Reason
              <textarea
                rows={7}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain what is missing or inaccurate."
                minLength={10}
                maxLength={2000}
                disabled={!signedIn || submitting || selected?.status === 'DISPUTED'}
              />
            </label>
            <p className="muted" aria-live="polite">{reason.trim().length}/2,000 characters (minimum 10).</p>
            <button
              className="btn"
              onClick={dispute}
              disabled={!signedIn || submitting || !selected || selected.status === 'DISPUTED' || reason.trim().length < 10}
            >
              {submitting ? 'Submitting dispute…' : 'Raise dispute'}
            </button>
            {selected?.status === 'DISPUTED' && <p className="muted">This deliverable already has an open dispute.</p>}
            {message && <div className="notice" role="status" aria-live="polite">{message}</div>}
          </div>
        </div>
      )}
    </>
  );
}
