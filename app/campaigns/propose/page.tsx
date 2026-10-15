'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase-browser';

const issueAreas = [
  'Agriculture & food systems', 'Climate & energy', 'Civil rights', 'Education',
  'Health care', 'Housing', 'Immigration', 'Jobs & labor', 'Technology & privacy',
  'Taxes & small business', 'Transportation & infrastructure', 'Veterans', 'Other federal issues',
];

type Proposal = { id: string; bill: string | null; title: string; status: string; campaign_id: string | null; created_at: string };

export default function ProposeCampaignPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [bill, setBill] = useState('');
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [goal, setGoal] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const billFromFeed = params.get('bill');
    const titleFromFeed = params.get('title');
    const sourceFromFeed = params.get('source');
    const objectiveFromFeed = params.get('objective');
    const areasFromFeed = (params.get('issue_areas') || '').split('|').filter((area) => issueAreas.includes(area));
    if (billFromFeed) setBill(billFromFeed.slice(0, 40).toUpperCase());
    if (titleFromFeed) setTitle(`Campaign for: ${titleFromFeed}`.slice(0, 180));
    if (sourceFromFeed && /^https:\/\//i.test(sourceFromFeed)) setSourceUrl(sourceFromFeed.slice(0, 2000));
    if (objectiveFromFeed) setObjective(`Proposed public objective: ${objectiveFromFeed}`.slice(0, 5000));
    if (areasFromFeed.length) setSelectedAreas(Array.from(new Set(areasFromFeed)));
    async function load() {
      const supabase = createClient();
      if (!supabase) {
        setMessage('CivicRaise is not connected to its account service. Try again later.');
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id || null);
      if (user) {
        const { data, error } = await supabase
          .from('campaign_proposals')
          .select('id,bill,title,status,campaign_id,created_at')
          .eq('submitted_by', user.id)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (error) setMessage('Your proposal history is unavailable right now.');
        else setProposals(data || []);
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function toggleArea(area: string) {
    setSelectedAreas((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving || selectedAreas.length === 0) return;
    setSaving(true);
    setMessage('');
    const supabase = createClient();
    if (!supabase) {
      setMessage('CivicRaise is not connected to its account service. Try again later.');
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.from('campaign_proposals').insert({
      submitted_by: userId,
      bill: bill.trim() ? bill.trim().toUpperCase() : null,
      title: title.trim(),
      objective: objective.trim(),
      proposed_goal_cents: Math.round(Number(goal) * 100),
      issue_areas: selectedAreas,
      source_url: sourceUrl.trim() || null,
    }).select('id,bill,title,status,campaign_id,created_at').single();

    if (error) setMessage('Could not submit the proposal. Please try again.');
    else {
      setProposals((current) => [data as Proposal, ...current]);
      setBill('');
      setTitle('');
      setObjective('');
      setGoal('');
      setSourceUrl('');
      setSelectedAreas([]);
      setMessage('Proposal submitted for CivicRaise admin review. Submitting a proposal is free and does not create a campaign or pledge.');
    }
    setSaving(false);
  }

  if (loading) return <div className="narrow"><h1>Propose a campaign</h1><p className="muted">Loading your account…</p></div>;
  if (!userId) {
    return <div className="narrow"><div className="eyebrow">CAMPAIGN INTAKE</div><h1>Propose a campaign</h1><p className="muted">Sign in to send a proposal for review. It is free to propose a campaign.</p>{message && <p role="status">{message}</p>}<Link className="btn primary" href="/auth">Sign in</Link></div>;
  }

  return (
    <div className="onboarding-form">
      <div className="onboarding-intro">
        <div className="eyebrow">CAMPAIGN INTAKE · FREE</div>
        <h1>Propose a campaign</h1>
        <p className="muted">Suggest a bill and explain the public objective. CivicRaise admins review proposals before a campaign is created. This does not collect money or publish anything automatically.</p>
      </div>
      <form className="card form" onSubmit={submit}>
        <label>Campaign title<input required minLength={5} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A clear, public-facing title" /></label>
        <label>Bill number <span className="form-help">Optional</span><input maxLength={40} value={bill} onChange={(event) => setBill(event.target.value)} placeholder="e.g. H.R. 1234" /></label>
        <label>Public objective<textarea required minLength={20} maxLength={5000} rows={5} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What policy outcome should this campaign support, and why?" /></label>
        <label>Proposed fundraising target<input required type="number" min="100" max="1000000" step="1" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. 20000" /><span className="form-help">Suggested target only; an admin reviews it before the campaign can be published. CivicRaise MVP pledges are test-only.</span></label>
        <label>Official bill or source link <span className="form-help">Optional; use a public source such as Congress.gov</span><input type="url" maxLength={2000} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.congress.gov/" /></label>
        <fieldset className="onboarding-section">
          <legend>Issue areas <span className="form-help">Choose at least one</span></legend>
          <div className="interest-options">
            {issueAreas.map((area) => <label className="interest-option" key={area}><input type="checkbox" checked={selectedAreas.includes(area)} onChange={() => toggleArea(area)} /><span>{area}</span></label>)}
          </div>
        </fieldset>
        <button className="btn primary" type="submit" disabled={saving || selectedAreas.length === 0}>{saving ? 'Submitting…' : 'Submit proposal'}</button>
      </form>
      {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Your proposals</h2>
        {proposals.length === 0 ? <p className="muted">You have not submitted a campaign proposal yet.</p> : (
          <div className="proposal-list">{proposals.map((proposal) => <article key={proposal.id}><strong>{proposal.title}</strong><p className="muted">{proposal.bill || 'Bill not specified'} · {proposal.status.replace(/_/g, ' ').toLowerCase()} · {new Date(proposal.created_at).toLocaleDateString()}</p>{proposal.status === 'APPROVED' && <p className="muted">A draft campaign was created and is awaiting admin setup.</p>}</article>)}</div>
        )}
      </section>
    </div>
  );
}
