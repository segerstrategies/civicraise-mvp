'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

type Legislation = {
  bill_code: string; title: string; summary: string; issue_areas: string[];
  source_url: string; bill_status: string; latest_action: string | null; verified_at: string;
};
type Stance = 'SUPPORT' | 'OPPOSE';

function normalizeBill(value: string) { return value.trim().toUpperCase(); }

export default function LegislationFeed({ legislation, userId, interests, initialStances }: {
  legislation: Legislation[]; userId: string | null; interests: string[];
  initialStances: Array<{ bill_code: string; stance: Stance }>;
}) {
  const [stances, setStances] = useState<Record<string, Stance>>(() =>
    Object.fromEntries(initialStances.map((item) => [normalizeBill(item.bill_code), item.stance]))
  );
  const [busyBill, setBusyBill] = useState('');
  const [message, setMessage] = useState('');
  const [issueFilter, setIssueFilter] = useState('All issues');
  const issueAreas = useMemo(() => Array.from(new Set(legislation.flatMap((item) => item.issue_areas || []))).sort(), [legislation]);
  const visibleLegislation = useMemo(() => legislation
    .filter((item) => issueFilter === 'All issues' || item.issue_areas.includes(issueFilter))
    .sort((a, b) => {
      const score = (item: Legislation) => item.issue_areas.filter((area) => interests.includes(area)).length;
      return score(b) - score(a) || a.bill_code.localeCompare(b.bill_code);
    }), [legislation, interests, issueFilter]);

  async function saveStance(billCode: string, stance: Stance | null) {
    if (!userId || busyBill) return;
    const key = normalizeBill(billCode);
    setBusyBill(key); setMessage('');
    const supabase = createClient();
    if (!supabase) { setMessage('CivicRaise is not connected to its account service. Try again later.'); setBusyBill(''); return; }
    const result = stance
      ? await supabase.from('legislation_stances').upsert({ user_id: userId, bill_code: key, stance, updated_at: new Date().toISOString() }, { onConflict: 'user_id,bill_code' })
      : await supabase.from('legislation_stances').delete().eq('user_id', userId).eq('bill_code', key);
    if (result.error) setMessage('Could not save your response. Please try again.');
    else {
      setStances((current) => { const next = { ...current }; if (stance) next[key] = stance; else delete next[key]; return next; });
      setMessage(stance ? `Your ${stance.toLowerCase()} position on ${key} is saved.` : `Your position on ${key} was removed.`);
    }
    setBusyBill('');
  }

  if (!legislation.length) return <div className="card"><h2>Issue-based legislation is coming soon</h2><p className="muted">The feed is maintained independently from campaigns. You can still propose a campaign about an issue you care about.</p><Link className="btn primary" href="/campaigns/propose">Propose a campaign</Link></div>;

  return <>
    <div className="notice"><strong>Your choices stay private to your account.</strong> A response is saved privately so you can change or remove it later. It is separate from pledges and ratification votes.</div>
    {!userId && <div className="notice">Sign in to save a private position. <Link href="/auth">Sign in</Link></div>}
    {message && <p role="status" aria-live="polite" className="muted">{message}</p>}
    <label className="issue-filter">Browse by issue area<select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)}><option>All issues</option>{issueAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
    <div className="grid two">
      {visibleLegislation.map((item) => {
        const current = stances[normalizeBill(item.bill_code)];
        const isBusy = busyBill === item.bill_code;
        const proposalHref = `/campaigns/propose?${new URLSearchParams({ bill: item.bill_code, title: item.title, objective: item.summary, source: item.source_url, issue_areas: item.issue_areas.join('|') }).toString()}`;
        return <article className="card legislation-card" key={item.bill_code}>
          <div className="eyebrow">{item.bill_code} · {item.bill_status}</div><h2>{item.title}</h2><p className="muted">{item.summary}</p>
          {item.issue_areas.length > 0 && <p className="issue-tags">{item.issue_areas.map((area) => <span key={area}>{area}</span>)}</p>}
          {item.latest_action && <p className="muted"><strong>Latest action:</strong> {item.latest_action}</p>}
          <p className="form-help">Source checked {new Date(`${item.verified_at}T00:00:00`).toLocaleDateString()}</p>
          <div className="actions">
            <button type="button" className={current === 'SUPPORT' ? 'btn primary' : 'btn'} aria-pressed={current === 'SUPPORT'} disabled={!userId || isBusy} onClick={() => void saveStance(item.bill_code, 'SUPPORT')}>Support</button>
            <button type="button" className={current === 'OPPOSE' ? 'btn primary' : 'btn'} aria-pressed={current === 'OPPOSE'} disabled={!userId || isBusy} onClick={() => void saveStance(item.bill_code, 'OPPOSE')}>Oppose</button>
            {current && <button type="button" className="btn" disabled={isBusy} onClick={() => void saveStance(item.bill_code, null)}>Clear response</button>}
            <Link className="btn" href={proposalHref}>Start a campaign about this bill</Link><a className="btn" href={item.source_url} target="_blank" rel="noreferrer">Official bill page</a>
          </div>
          {current && <p className="muted">Your saved position: <strong>{current.toLowerCase()}</strong></p>}
        </article>;
      })}
    </div>
    <div className="actions"><Link className="btn" href="/campaigns/propose">Propose a new campaign</Link></div>
  </>;
}
