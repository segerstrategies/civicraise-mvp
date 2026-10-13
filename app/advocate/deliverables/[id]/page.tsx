'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

function formatDeadline(value?: string | null) {
  if (!value) return 'No due date scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Deadline unavailable'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export default function Deliverables() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [milestoneId, setMilestoneId] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const supabase = createClient();
    if (!supabase || !id) {
      setMessage('Supabase is not configured.');
      return;
    }

    const { data: currentContract, error: contractError } = await supabase
      .from('contracts')
      .select('*,rfps(campaign_id,title)')
      .eq('id', id)
      .maybeSingle();

    if (contractError) {
      setMessage(contractError.message);
      return;
    }
    if (!currentContract) {
      setMessage('This contract could not be found for your account.');
      setContract(null);
      return;
    }
    setContract(currentContract);

    if (currentContract.rfps?.campaign_id) {
      const { data, error } = await supabase
        .from('campaign_milestones')
        .select('*')
        .eq('campaign_id', currentContract.rfps.campaign_id)
        .order('sequence');

      if (error) {
        setMessage(error.message);
        return;
      }

      const rows = data || [];
      setMilestones(rows);
      setMilestoneId((selected) =>
        rows.some((milestone: any) => milestone.id === selected)
          ? selected
          : rows[0]?.id || ''
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        await load();
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load this contract.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit() {
    if (!milestoneId || description.trim().length < 20 || submitting) return;

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: id, milestoneId, description: description.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.message || (response.ok ? 'Deliverable submitted.' : 'Submission failed.'));

      if (response.ok) {
        setDescription('');
        await load();
      }
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedMilestone = milestones.find((milestone) => milestone.id === milestoneId);
  const activeContract = ['ACTIVE', 'IN_PROGRESS'].includes(String(contract?.status || '').toUpperCase());
  const descriptionLength = description.trim().length;

  if (loading) {
    return <><div className="eyebrow">CONTRACT EXECUTION</div><h1>Loading contract…</h1></>;
  }

  if (!contract) {
    return (
      <>
        <div className="eyebrow">CONTRACT EXECUTION</div>
        <h1>Contract unavailable</h1>
        <div className="card">
          <p className="muted" role="alert">{message || 'This contract could not be found.'}</p>
          <Link href="/advocate/contracts" className="btn">Back to contracts</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">CONTRACT EXECUTION</div>
      <h1>Submit deliverable</h1>
      <div className="card form">
        <p><strong>{contract.rfps?.title || 'Advocacy contract'}</strong> · {contract.status}</p>
        {!activeContract && <div className="notice">This contract is not accepting new deliverables.</div>}
        <label>
          Milestone
          <select
            value={milestoneId}
            onChange={(event) => setMilestoneId(event.target.value)}
            disabled={!activeContract || submitting || milestones.length === 0}
          >
            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.sequence}. {milestone.name} · {'$'}{(milestone.amount_cents / 100).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {selectedMilestone && <p className="muted">Due: {formatDeadline(selectedMilestone.due_at)}</p>}
        <label>
          Deliverable description
          <textarea
            rows={8}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the work completed and evidence available for review."
            minLength={20}
            maxLength={5000}
            disabled={!activeContract || submitting}
          />
        </label>
        <p className="muted" aria-live="polite">{descriptionLength}/5,000 characters (minimum 20).</p>
        <button
          className="btn primary"
          onClick={submit}
          disabled={!activeContract || !milestoneId || descriptionLength < 20 || descriptionLength > 5000 || submitting}
        >
          {submitting ? 'Submitting for review…' : 'Submit for review'}
        </button>
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </div>
    </>
  );
}
