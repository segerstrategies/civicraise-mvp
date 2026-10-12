'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  const [msg, setMsg] = useState('');

  async function load() {
    const sb = createClient();
    if (!sb || !id) return;

    const { data: currentContract, error: contractError } = await sb
      .from('contracts')
      .select('*,rfps(campaign_id,title)')
      .eq('id', id)
      .maybeSingle();

    if (contractError) {
      setMsg(contractError.message);
      return;
    }
    setContract(currentContract);

    if (currentContract?.rfps?.campaign_id) {
      const { data, error } = await sb
        .from('campaign_milestones')
        .select('*')
        .eq('campaign_id', currentContract.rfps.campaign_id)
        .order('sequence');

      if (error) {
        setMsg(error.message);
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
    void load();
  }, [id]);

  async function submit() {
    const response = await fetch('/api/deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: id, milestoneId, description }),
    });
    const result = await response.json();
    setMsg(result.message || 'Deliverable submission completed.');
    if (response.ok) {
      setDescription('');
      await load();
    }
  }

  const selectedMilestone = milestones.find((milestone) => milestone.id === milestoneId);

  return (
    <>
      <div className="eyebrow">CONTRACT EXECUTION</div>
      <h1>Submit deliverable</h1>
      <div className="card form">
        <p><strong>{contract?.rfps?.title || 'Loading...'}</strong></p>
        <label>
          Milestone
          <select value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}>
            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.sequence}. {milestone.name} · ${(milestone.amount_cents / 100).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {selectedMilestone && (
          <p className="muted">
            Due: {formatDeadline(selectedMilestone.due_at)}
          </p>
        )}
        <label>
          Deliverable description
          <textarea
            rows={8}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the work completed and evidence available for review."
          />
        </label>
        <button
          className="btn primary"
          onClick={submit}
          disabled={!milestoneId || !description.trim()}
        >
          Submit for review
        </button>
        {msg && <p className="muted">{msg}</p>}
      </div>
    </>
  );
}
