'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

type VoteRecord = {
  approve: boolean;
  pledgedCents: number;
};

const formatMoney = (cents: number) => (Number(cents || 0) / 100).toLocaleString(undefined, {
  style: 'currency',
  currency: 'USD',
});

export default function Ratification() {
  const [ballots, setBallots] = useState<any[]>([]);
  const [votes, setVotes] = useState<Record<string, VoteRecord>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyBallotId, setBusyBallotId] = useState('');
  const [busyVote, setBusyVote] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBallots() {
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
        setMessage('Sign in to review ballots for campaigns you backed.');
        return;
      }

      const { data: pledgeRows, error: pledgeError } = await supabase
        .from('pledges')
        .select('campaign_id')
        .eq('user_id', user.id);

      if (cancelled) return;
      if (pledgeError) {
        setMessage(pledgeError.message);
        return;
      }

      const campaignIds = Array.from(new Set(
        (pledgeRows ?? []).map((pledge: any) => pledge.campaign_id).filter(Boolean)
      ));
      if (campaignIds.length === 0) {
        setBallots([]);
        return;
      }

      const { data: ballotRows, error: ballotError } = await supabase
        .from('ratification_ballots')
        .select('id,campaign_id,opened_at,quorum_percent,approval_percent,campaigns(title,bill)')
        .in('campaign_id', campaignIds)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false });

      if (cancelled) return;
      if (ballotError) {
        setMessage(ballotError.message);
        return;
      }

      const rows = ballotRows ?? [];
      setBallots(rows);
      const ballotIds = rows.map((ballot: any) => ballot.id);
      if (ballotIds.length === 0) return;

      const { data: voteRows, error: voteError } = await supabase
        .from('ratification_votes')
        .select('ballot_id,approve,pledged_cents')
        .eq('user_id', user.id)
        .in('ballot_id', ballotIds);

      if (cancelled) return;
      if (voteError) {
        setMessage(voteError.message);
        return;
      }

      setVotes(Object.fromEntries(
        (voteRows ?? []).map((vote: any) => [
          vote.ballot_id,
          { approve: Boolean(vote.approve), pledgedCents: Number(vote.pledged_cents || 0) },
        ])
      ));
    }

    void loadBallots()
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load open ballots.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function vote(ballotId: string, approve: boolean) {
    setBusyBallotId(ballotId);
    setBusyVote(approve);
    setMessages((current) => ({ ...current, [ballotId]: '' }));

    try {
      const response = await fetch('/api/ratification/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ballotId, approve }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessages((current) => ({
          ...current,
          [ballotId]: result.message || 'Your vote could not be recorded.',
        }));
        return;
      }

      setVotes((current) => ({
        ...current,
        [ballotId]: { approve, pledgedCents: Number(result.pledgedCents || 0) },
      }));
      setMessages((current) => ({
        ...current,
        [ballotId]: result.message || 'Vote recorded.',
      }));
    } catch {
      setMessages((current) => ({
        ...current,
        [ballotId]: 'Unable to reach CivicRaise. Check your connection and try again.',
      }));
    } finally {
      setBusyBallotId('');
      setBusyVote(null);
    }
  }

  const hasSignInMessage = message.toLowerCase().includes('sign in');

  return (
    <>
      <div className="eyebrow">BACKER REVIEW</div>
      <h1>Ratification</h1>
      <p className="muted">
        Review open ballots for campaigns you backed. Participation is weighted by your pledged dollars.
      </p>

      {message && (
        <div className="notice" role="alert">
          {message} {hasSignInMessage && <Link href="/auth">Sign in</Link>}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="muted">Loading open ballots…</p></div>
      ) : ballots.length === 0 ? (
        <div className="card">
          <h2>Review completed advocacy work</h2>
          <p className="muted">No open ballots are available for campaigns you backed.</p>
        </div>
      ) : (
        <div className="grid">
          {ballots.map((ballot) => {
            const currentVote = votes[ballot.id];
            const campaign = Array.isArray(ballot.campaigns) ? ballot.campaigns[0] : ballot.campaigns;

            return (
              <section className="card" key={ballot.id}>
                <div className="eyebrow">{campaign?.bill || 'CAMPAIGN'} · OPEN BALLOT</div>
                <h2>{campaign?.title || 'Review completed advocacy work'}</h2>
                <p>
                  Quorum is {ballot.quorum_percent}% of pledged dollars, followed by{' '}
                  {ballot.approval_percent}% affirmative approval among participating dollars.
                </p>
                {currentVote && (
                  <div className="notice">
                    <p>
                      Your current vote: <strong>{currentVote.approve ? 'Approve' : 'Reject / challenge'}</strong>
                    </p>
                    <p>
                      Voting weight recorded: <strong>{formatMoney(currentVote.pledgedCents)}</strong>
                    </p>
                    <p className="muted">You can update your vote while the ballot is open.</p>
                  </div>
                )}
                <div className="actions">
                  <button
                    disabled={Boolean(busyBallotId)}
                    className="btn primary"
                    onClick={() => vote(ballot.id, true)}
                  >
                    {busyBallotId === ballot.id && busyVote === true ? 'Saving…' : currentVote?.approve ? 'Keep approval' : 'Approve deliverable'}
                  </button>
                  <button
                    disabled={Boolean(busyBallotId)}
                    className="btn"
                    onClick={() => vote(ballot.id, false)}
                  >
                    {busyBallotId === ballot.id && busyVote === false ? 'Saving…' : currentVote && !currentVote.approve ? 'Keep challenge' : 'Reject / challenge'}
                  </button>
                </div>
                {messages[ballot.id] && <div className="notice" role="status" aria-live="polite">{messages[ballot.id]}</div>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
