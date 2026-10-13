'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function Rfp() {
  const { id } = useParams<{ id: string }>();
  const [bid, setBid] = useState('');
  const [proposal, setProposal] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [rfp, setRfp] = useState<any>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRfp() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setLoadError('Supabase is not configured.');
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        setSignedIn(Boolean(user));

        const selectRfp = () => supabase.from('rfps').select('*,campaigns(*)');
        const { data: bySlug, error: slugError } = await selectRfp().eq('slug', id).maybeSingle();
        if (slugError) {
          setLoadError(slugError.message);
          return;
        }

        let foundRfp = bySlug;
        if (!foundRfp && isUuid(id)) {
          const { data: byId, error: idError } = await selectRfp().eq('id', id).maybeSingle();
          if (idError) {
            setLoadError(idError.message);
            return;
          }
          foundRfp = byId;
        }

        if (cancelled) return;
        if (!foundRfp) {
          setLoadError('This RFP could not be found.');
          return;
        }
        setRfp(foundRfp);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load this RFP.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRfp();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rfp || submitting) return;

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/test-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfpId: rfp.id, amount: Number(bid), proposal: proposal.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.message || (response.ok ? 'Bid submitted.' : 'Bid could not be submitted.'));
      if (response.ok) setProposal('');
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <><div className="eyebrow">RFP</div><h1>Loading RFP…</h1></>;
  }

  if (loadError || !rfp) {
    return (
      <>
        <div className="eyebrow">ADVOCATE MARKETPLACE</div>
        <h1>RFP unavailable</h1>
        <div className="card">
          <p className="muted" role="alert">{loadError || 'This RFP could not be found.'}</p>
          <Link href="/advocate/rfps" className="btn">Back to open RFPs</Link>
        </div>
      </>
    );
  }

  const campaign = Array.isArray(rfp.campaigns) ? rfp.campaigns[0] : rfp.campaigns;
  const budgetCents = Number(rfp.budget_cents || 0);
  const amount = Number(bid);
  const amountValid = Number.isFinite(amount) && amount > 0 && amount * 100 <= budgetCents;
  const proposalValid = proposal.trim().length >= 20 && proposal.trim().length <= 5000;
  const acceptingBids = rfp.status === 'OPEN' && campaign?.status === 'RFP_OPEN';

  return (
    <>
      <div className="eyebrow">RFP · {rfp.slug}</div>
      <h1>{rfp.title}</h1>
      <div className="card">
        <h2>Scope</h2>
        <p>Provide the defined federal advocacy services described in the campaign milestones. Outcome guarantees are not part of the contract.</p>
        <p><strong>Budget:</strong> {(budgetCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>

        {!acceptingBids ? (
          <p className="notice">This RFP is not accepting bids right now.</p>
        ) : !signedIn ? (
          <>
            <p className="muted">Sign in to submit a bid.</p>
            <Link href="/auth" className="btn primary">Sign in</Link>
          </>
        ) : (
          <form className="form" onSubmit={submit}>
            <label>
              Bid amount
              <input
                value={bid}
                onChange={(event) => setBid(event.target.value)}
                placeholder="Amount in dollars"
                inputMode="decimal"
                type="number"
                min="0.01"
                max={(budgetCents / 100).toFixed(2)}
                step="0.01"
                required
                disabled={submitting}
              />
            </label>
            <label>
              Proposal
              <textarea
                value={proposal}
                onChange={(event) => setProposal(event.target.value)}
                rows={5}
                minLength={20}
                maxLength={5000}
                placeholder="Briefly describe your approach and relevant experience."
                required
                disabled={submitting}
              />
            </label>
            <p className="muted">Proposal must be 20–5,000 characters. Your bid cannot exceed the RFP budget.</p>
            <button className="btn primary" type="submit" disabled={submitting || !amountValid || !proposalValid}>
              {submitting ? 'Submitting bid…' : 'Submit test bid'}
            </button>
          </form>
        )}
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </div>
    </>
  );
}
