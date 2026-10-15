'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

type Campaign = {
  id: string;
  slug?: string | null;
  title: string;
  bill: string;
  description?: string | null;
  issue_areas?: string[] | null;
  status?: string | null;
};
type Stance = 'SUPPORT' | 'OPPOSE';

function normalizeBill(value: string) {
  return value.trim().toUpperCase();
}

export default function LegislationFeed({
  campaigns,
  userId,
  interests,
  initialStances,
}: {
  campaigns: Campaign[];
  userId: string | null;
  interests: string[];
  initialStances: Array<{ bill_code: string; stance: Stance }>;
}) {
  const [stances, setStances] = useState<Record<string, Stance>>(() =>
    Object.fromEntries(initialStances.map((item) => [normalizeBill(item.bill_code), item.stance]))
  );
  const [busyBill, setBusyBill] = useState('');
  const [message, setMessage] = useState('');

  const legislation = useMemo(() => {
    const grouped = new Map<string, { bill: string; campaigns: Campaign[]; issueAreas: Set<string> }>();
    for (const campaign of campaigns) {
      const billCode = normalizeBill(campaign.bill);
      const existing = grouped.get(billCode) || { bill: billCode, campaigns: [], issueAreas: new Set<string>() };
      existing.campaigns.push(campaign);
      for (const area of campaign.issue_areas || []) existing.issueAreas.add(area);
      grouped.set(billCode, existing);
    }
    return Array.from(grouped.values()).sort((a, b) => {
      const score = (areas: Set<string>) => Array.from(areas).filter((area) => interests.includes(area)).length;
      return score(b.issueAreas) - score(a.issueAreas) || a.bill.localeCompare(b.bill);
    });
  }, [campaigns, interests]);

  async function saveStance(billCode: string, stance: Stance | null) {
    if (!userId || busyBill) return;
    const key = normalizeBill(billCode);
    setBusyBill(key);
    setMessage('');
    const supabase = createClient();
    if (!supabase) {
      setMessage('CivicRaise is not connected to its account service. Try again later.');
      setBusyBill('');
      return;
    }

    const result = stance
      ? await supabase.from('legislation_stances').upsert(
          { user_id: userId, bill_code: key, stance, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,bill_code' }
        )
      : await supabase.from('legislation_stances').delete().eq('user_id', userId).eq('bill_code', key);

    if (result.error) {
      setMessage('Could not save your response. Please try again.');
    } else {
      setStances((current) => {
        const next = { ...current };
        if (stance) next[key] = stance;
        else delete next[key];
        return next;
      });
      setMessage(stance ? `Your ${stance.toLowerCase()} position on ${key} is saved.` : `Your position on ${key} was removed.`);
    }
    setBusyBill('');
  }

  if (!legislation.length) {
    return (
      <div className="card">
        <h2>No legislation is listed yet</h2>
        <p className="muted">Bills appear here when a CivicRaise campaign is linked to them. You can propose a campaign to get a bill considered.</p>
        <Link className="btn primary" href="/campaigns/propose">Propose a campaign</Link>
      </div>
    );
  }

  return (
    <>
      <div className="notice">
        <strong>Your choices stay private to your account.</strong> When you respond, CivicRaise saves your position so you can change or remove it later. Your position is separate from any pledge or ratification vote.
      </div>
      {!userId && <div className="notice">Sign in to save a private position. <Link href="/auth">Sign in</Link></div>}
      {message && <p role="status" aria-live="polite" className="muted">{message}</p>}
      <div className="grid two">
        {legislation.map((item) => {
          const current = stances[item.bill];
          const campaign = item.campaigns[0];
          const isBusy = busyBill === item.bill;
          return (
            <article className="card legislation-card" key={item.bill}>
              <div className="eyebrow">{item.bill}</div>
              <h2>{campaign.title}</h2>
              <p className="muted">{campaign.description}</p>
              {item.issueAreas.size > 0 && (
                <p className="issue-tags">{Array.from(item.issueAreas).map((area) => <span key={area}>{area}</span>)}</p>
              )}
              <p className="muted">{item.campaigns.length} related CivicRaise campaign{item.campaigns.length === 1 ? '' : 's'}</p>
              <div className="actions">
                <button type="button" className={current === 'SUPPORT' ? 'btn primary' : 'btn'} aria-pressed={current === 'SUPPORT'} disabled={!userId || isBusy} onClick={() => void saveStance(item.bill, 'SUPPORT')}>
                  Support
                </button>
                <button type="button" className={current === 'OPPOSE' ? 'btn primary' : 'btn'} aria-pressed={current === 'OPPOSE'} disabled={!userId || isBusy} onClick={() => void saveStance(item.bill, 'OPPOSE')}>
                  Oppose
                </button>
                {current && <button type="button" className="btn" disabled={isBusy} onClick={() => void saveStance(item.bill, null)}>Clear response</button>}
                <Link className="btn" href={'/campaigns/' + (campaign.slug || campaign.id)}>Campaign details</Link>
              </div>
              {current && <p className="muted">Your saved position: <strong>{current.toLowerCase()}</strong></p>}
            </article>
          );
        })}
      </div>
      <div className="actions"><Link className="btn" href="/campaigns">Browse all campaigns</Link><Link className="btn" href="/campaigns/propose">Propose a campaign</Link></div>
    </>
  );
}
