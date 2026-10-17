'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

function RatificationDemo() {
  const [votesRecorded, setVotesRecorded] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const totalPledged = 10_000;
  const yes = votesRecorded ? 6_800 : 0;
  const no = votesRecorded ? 1_200 : 0;
  const participating = yes + no;
  const quorumMet = participating >= totalPledged * 0.6;
  const approvalMet = participating > 0 && yes / participating >= 0.85;
  const approved = quorumMet && approvalMet;

  return (
    <>
      <div className="eyebrow">BACKER REVIEW · DEMO</div>
      <h1>Ratification walkthrough</h1>
      <p className="muted">
        This browser-only demo uses sample pledges and votes. It does not save anything to CivicRaise.
      </p>

      <section className="card">
        <div className="eyebrow">SAMPLE OPEN BALLOT</div>
        <h2>Agricultural Right-to-Repair Act: Demo Campaign</h2>
        <p>Quorum: 60% of pledged dollars · Approval: 85% of participating dollars</p>
        <p>Total pledged: <strong>$100.00</strong></p>
        <p>Sample backers: $68 approve · $12 reject · $20 do not vote</p>

        <section className="notice" aria-labelledby="demo-deliverable-title">
          <div className="eyebrow">ILLUSTRATIVE SUBMISSION · MILESTONE 1 OF 3</div>
          <h3 id="demo-deliverable-title">Policy analysis and bill review</h3>
          <p>
            The advocate compared the proposed Right-to-Repair language with current federal policy,
            identified implementation questions, and prepared recommended revisions for staff review.
          </p>
          <p><strong>Submitted:</strong> October 10, 2026 · <strong>Review status:</strong> Awaiting backer ratification</p>
          <h4>Review checklist</h4>
          <ul>
            <li>Does the work address the campaign&apos;s stated policy objective?</li>
            <li>Are the analysis and recommendations clear enough for the next advocacy step?</li>
            <li>Is any required work missing from this milestone?</li>
          </ul>
          <p className="muted">This sample illustrates the information a backer would review before voting. No document or payment is attached in this demo.</p>
        </section>

        <div className="actions">
          <button className="btn" disabled={votesRecorded || finalized} onClick={() => setVotesRecorded(true)}>
            {votesRecorded ? 'Sample votes recorded' : 'Record sample votes'}
          </button>
          <button className="btn primary" disabled={!votesRecorded || finalized} onClick={() => setFinalized(true)}>
            Finalize demo ballot
          </button>
          <button className="btn" onClick={() => { setVotesRecorded(false); setFinalized(false); }}>
            Reset demo
          </button>
        </div>

        {votesRecorded && !finalized && (
          <div className="notice" role="status">
            Pledge-weighted participation: $80.00 ($68.00 approve · $12.00 reject).
          </div>
        )}

        {finalized && (
          <div className="notice" role="status">
            <strong>Demo result: {approved ? 'RATIFIED' : 'REJECTED'}</strong>
            <p>Quorum: {participating / totalPledged * 100}% (required 60%) · Approval: {yes / participating * 100}% (required 85%).</p>
            <p>Demo campaign result: {approved ? 'DISBURSEMENT_PENDING' : 'DISPUTED'}.</p>
            <p className="muted">In a real ballot, finalization also writes ledger and audit records. This demo only shows the outcome.</p>
          </div>
        )}
      </section>
    </>
  );
}

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
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBallots() {
      if (new URLSearchParams(window.location.search).get('demo') === 'ratification') {
        setDemoMode(true);
        return;
      }

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
        .select('id,campaign_id,deliverable_id,opened_at,quorum_percent,approval_percent,campaigns(title,bill),deliverables(id,description,status,submitted_at,campaign_milestones(name,amount_cents))')
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

  if (demoMode) return <RatificationDemo />;

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
            const deliverable = Array.isArray(ballot.deliverables) ? ballot.deliverables[0] : ballot.deliverables;
            const milestone = Array.isArray(deliverable?.campaign_milestones)
              ? deliverable.campaign_milestones[0]
              : deliverable?.campaign_milestones;

            return (
              <section className="card" key={ballot.id}>
                <div className="eyebrow">{campaign?.bill || 'CAMPAIGN'} · OPEN BALLOT</div>
                <h2>{campaign?.title || 'Review completed advocacy work'}</h2>
                <p>
                  Quorum is {ballot.quorum_percent}% of pledged dollars, followed by{' '}
                  {ballot.approval_percent}% affirmative approval among participating dollars.
                </p>
                <div className="notice">
                  <h3>{milestone?.name || 'Submitted campaign deliverable'}</h3>
                  {deliverable ? (
                    <>
                      <p>{deliverable.description}</p>
                      <p>
                        <strong>Status:</strong> {String(deliverable.status || 'SUBMITTED').replace(/_/g, ' ')}
                        {deliverable.submitted_at && <> · <strong>Submitted:</strong> {new Date(deliverable.submitted_at).toLocaleDateString()}</>}
                      </p>
                      {milestone?.amount_cents != null && <p><strong>Milestone amount:</strong> {formatMoney(Number(milestone.amount_cents))}</p>}
                    </>
                  ) : (
                    <p className="muted">The work summary is not attached to this ballot. Review the campaign details before voting.</p>
                  )}
                  <p className="muted">Consider whether the submitted work meets the milestone described in the campaign.</p>
                </div>
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
