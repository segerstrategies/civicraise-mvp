'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function Dashboard() {
  const [pledges, setPledges] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const supabase = createClient();
        if (!supabase) {
          setMessage('Supabase is not configured.');
          return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError) {
          setMessage(authError.message);
          return;
        }
        if (!user) {
          setMessage('Sign in to see your personal activity.');
          return;
        }

        setSignedIn(true);
        setEmail(user.email ?? '');

        const { data: pledgeRows, error: pledgeError } = await supabase
          .from('pledges')
          .select('id,amount_cents,created_at,campaign_id,campaigns(title,bill)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (pledgeError) {
          setMessage(pledgeError.message);
          return;
        }

        const rows = pledgeRows ?? [];
        setPledges(rows);
        const campaignIds = Array.from(new Set(
          rows.map((pledge: any) => pledge.campaign_id).filter(Boolean)
        ));

        if (campaignIds.length === 0) {
          setPendingReviews(0);
          return;
        }

        const { data: ballots, error: ballotError } = await supabase
          .from('ratification_ballots')
          .select('id')
          .in('campaign_id', campaignIds)
          .eq('status', 'OPEN');

        if (cancelled) return;
        if (ballotError) {
          setMessage(ballotError.message);
          return;
        }

        const ballotIds = (ballots ?? []).map((ballot: any) => ballot.id);
        if (ballotIds.length === 0) {
          setPendingReviews(0);
          return;
        }

        const { data: votes, error: voteError } = await supabase
          .from('ratification_votes')
          .select('ballot_id')
          .eq('user_id', user.id)
          .in('ballot_id', ballotIds);

        if (cancelled) return;
        if (voteError) {
          setMessage(voteError.message);
          return;
        }

        const votedBallotIds = new Set((votes ?? []).map((vote: any) => vote.ballot_id));
        setPendingReviews(ballotIds.filter((id: string) => !votedBallotIds.has(id)).length);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your activity.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <>
        <div className="eyebrow">CITIZEN DASHBOARD</div>
        <h1>Your CivicRaise activity</h1>
        <div className="card"><p className="muted">Loading your pledges and reviews…</p></div>
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <div className="eyebrow">CITIZEN DASHBOARD</div>
        <h1>Your CivicRaise activity</h1>
        <div className="card">
          <p className="muted">{message || 'Sign in to see your personal activity.'}</p>
          <Link href="/auth" className="btn primary">Sign in</Link>
        </div>
      </>
    );
  }

  const total = pledges.reduce((sum, pledge) => sum + Number(pledge.amount_cents || 0), 0) / 100;

  return (
    <>
      <div className="eyebrow">CITIZEN DASHBOARD</div>
      <h1>Your CivicRaise activity</h1>
      {email && <p className="muted">Signed in as {email}</p>}
      {message && <div className="notice" role="alert">{message}</div>}

      <div className="grid">
        <div className="card">
          <div className="metric">{'$'}{total.toFixed(2)}</div>
          <p className="muted">Test pledges</p>
        </div>
        <div className="card">
          <div className="metric">{pledges.length}</div>
          <p className="muted">Pledges</p>
        </div>
        <div className="card">
          <div className="metric">{pendingReviews === null ? '—' : pendingReviews}</div>
          <p className="muted">Pending reviews</p>
          {pendingReviews ? (
            <Link href="/ratification" className="btn primary">Review open ballots</Link>
          ) : (
            <p className="muted">Open ballots for campaigns you backed that still need your vote.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Recent activity</h2>
        {pledges.length === 0 ? (
          <p className="muted">No pledges yet. <Link href="/campaigns">Explore campaigns.</Link></p>
        ) : (
          <table>
            <thead><tr><th>Campaign</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {pledges.map((pledge) => (
                <tr key={pledge.id}>
                  <td>{pledge.campaigns?.bill} · {pledge.campaigns?.title}</td>
                  <td>{'$'}{(pledge.amount_cents / 100).toFixed(2)}</td>
                  <td>{new Date(pledge.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
