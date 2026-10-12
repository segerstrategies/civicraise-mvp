
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [rfp, setRfp] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [ballot, setBallot] = useState<any>(null);
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [advocates, setAdvocates] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [dueDateDrafts, setDueDateDrafts] = useState<Record<string, string>>({});
  const [savingMilestoneId, setSavingMilestoneId] = useState('');
  const [milestoneMessage, setMilestoneMessage] = useState('');
  const [msg, setMsg] = useState('');

  async function loadCampaign(campaignId: string) {
    const sb = createClient();
    if (!sb || !campaignId) return;

    setSelectedCampaignId(campaignId);

    const { data: c } = await sb
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();

    setCampaign(c);

    if (!c) {
      setRfp(null);
      setBids([]);
      setContracts([]);
      setBallot(null);
      setDeliverables([]);
      setMilestones([]);
      setDueDateDrafts({});
      return;
    }

    const { data: milestoneRows } = await sb
      .from('campaign_milestones')
      .select('*')
      .eq('campaign_id', c.id)
      .order('sequence');

    const loadedMilestones = milestoneRows || [];
    setMilestones(loadedMilestones);
    setDueDateDrafts(Object.fromEntries(loadedMilestones.map((item: any) => [
      item.id,
      toLocalDateTime(item.due_at),
    ])));
    setMilestoneMessage('');

    const { data: r } = await sb
      .from('rfps')
      .select('*')
      .eq('campaign_id', c.id)
      .maybeSingle();

    setRfp(r);

    if (r) {
      const { data: b } = await sb
        .from('bids')
        .select('*')
        .eq('rfp_id', r.id)
        .order('created_at');

      setBids(b || []);

      const { data: cs } = await sb
        .from('contracts')
        .select('*')
        .eq('rfp_id', r.id);

      setContracts(cs || []);
    } else {
      setBids([]);
      setContracts([]);
    }

    const { data: bl } = await sb
      .from('ratification_ballots')
      .select('*')
      .eq('campaign_id', c.id)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setBallot(bl);

    const { data: d } = await sb
      .from('deliverables')
      .select('*,campaign_milestones(name),contracts!inner(advocate_id,rfps!inner(campaign_id))')
      .eq('contracts.rfps.campaign_id', c.id)
      .order('submitted_at', { ascending: false });

    setDeliverables(d || []);
  }

  async function load() {
    const sb = createClient();
    if (!sb) return;

    const { data: auth } = await sb.auth.getUser();
    const currentUser = auth.user;

    setUser(currentUser);

    if (!currentUser) return;

    const { data: p } = await sb
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    setProfile(p);

    const { data: cs } = await sb
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    const availableCampaigns = cs || [];
    setCampaigns(availableCampaigns);

    const { data: av } = await sb
      .from('advocate_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setAdvocates(av || []);

    if (p?.role === 'admin') {
      const { data: events } = await sb
        .from('audit_events')
        .select('id,event_type,entity_type,entity_id,payload,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      setAuditEvents(events || []);
    } else {
      setAuditEvents([]);
    }

    if (availableCampaigns.length) {
      const existingSelection = availableCampaigns.find(
        (item) => item.id === selectedCampaignId
      );

      const preferredCampaign =
        availableCampaigns.find((item) => item.slug === 'hr-5602-demo') ||
        availableCampaigns[0];

      await loadCampaign(
        existingSelection?.id || preferredCampaign.id
      );
    } else {
      setCampaign(null);
      setRfp(null);
      setBids([]);
      setContracts([]);
      setBallot(null);
      setDeliverables([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function selectBid(id: string) {
    const r = await fetch('/api/admin/select-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId: id }),
    });

    const j = await r.json();
    setMsg(j.message || 'Bid selection request completed.');
    await load();
  }

  async function advance(status: string) {
    if (!campaign) return;

    const r = await fetch('/api/admin/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaign.id, status }),
    });

    const j = await r.json();
    setMsg(j.message || 'Campaign update request completed.');
    await load();
  }

  async function verifyAdvocate(id: string, status: string) {
    const r = await fetch('/api/admin/advocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advocateId: id, status }),
    });

    const j = await r.json();
    setMsg(j.message || 'Advocate verification request completed.');
    await load();
  }

  async function saveMilestoneDueDate(milestoneId: string) {
    const sb = createClient();
    if (!sb) return;

    const value = dueDateDrafts[milestoneId] || '';
    const dueAt = value ? new Date(value).toISOString() : null;
    setSavingMilestoneId(milestoneId);
    setMilestoneMessage('');

    const { data, error } = await sb.rpc('admin_set_milestone_due_at', {
      p_milestone_id: milestoneId,
      p_due_at: dueAt,
    });

    setSavingMilestoneId('');
    if (error) {
      setMilestoneMessage('Could not save the deadline. Apply the milestone deadline migration first. ' + error.message);
      return;
    }
    if (data?.ok === false) {
      setMilestoneMessage(data.message || 'The deadline was not saved.');
      return;
    }

    setMilestones((rows) => rows.map((item) =>
      item.id === milestoneId ? { ...item, due_at: dueAt } : item
    ));
    setMilestoneMessage(data?.message || 'Milestone deadline saved.');
  }

  async function finalize() {
    if (!ballot) return;

    const r = await fetch('/api/ratification/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ballotId: ballot.id }),
    });

    const j = await r.json();
    setMsg(j.message || 'Ballot finalization request completed.');
    await load();
  }

  if (!user) {
    return (
      <>
        <div className="eyebrow">ADMIN · MVP</div>
        <h1>Operations console</h1>
        <p className="muted">Sign in with your test admin account.</p>
        <Link href="/auth" className="btn primary">Sign in</Link>
      </>
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <>
        <div className="eyebrow">ADMIN · MVP</div>
        <h1>Operations console</h1>
        <div className="notice">
          This account is not an admin. Use the database editor to assign
          the admin role for testing.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">ADMIN · MVP</div>
      <h1>Operations console</h1>

      {msg && <div className="notice">{msg}</div>}

      <div className="card" style={{ marginBottom: 18 }}>
        <label htmlFor="campaign-select">
          <strong>Active campaign</strong>
        </label>
        <select
          id="campaign-select"
          className="input"
          value={selectedCampaignId}
          onChange={(e) => loadCampaign(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 8 }}
        >
          {campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.status}
            </option>
          ))}
        </select>
        <p className="muted">
          Actions below apply to the selected campaign and its associated RFP.
        </p>
      </div>

      <div className="grid">
        <div className="card">
          <div className="eyebrow">CAMPAIGN</div>
          <h2>{campaign?.title || 'No campaign selected'}</h2>
          <p>Status: <strong>{campaign?.status || 'N/A'}</strong></p>
          <div className="actions">
            <button className="btn" onClick={() => advance('FUNDED')} disabled={campaign?.status !== 'FUNDING'}>
              Mark funded
            </button>
            <button className="btn" onClick={() => advance('RFP_OPEN')} disabled={campaign?.status !== 'FUNDED'}>
              Open RFP
            </button>
            <button className="btn" onClick={() => advance('BID_REVIEW')} disabled={campaign?.status !== 'RFP_OPEN'}>
              Start bid review
            </button>
          </div>
          <p className="muted">
            {campaign?.status === 'FUNDING'
              ? 'Mark the campaign funded to open its RFP.'
              : campaign?.status === 'FUNDED'
                ? 'Open the RFP to accept bids.'
                : campaign?.status === 'RFP_OPEN'
                  ? 'Start bid review before selecting a bid.'
                  : campaign?.status === 'BID_REVIEW'
                    ? 'Review submitted bids and select one below.'
                    : 'Workflow actions are enabled only when valid for the campaign status.'}
          </p>
        </div>

        <div className="card">
          <div className="eyebrow">RFP</div>
          <h2>{rfp?.title || 'No RFP for this campaign'}</h2>
          <p>{bids.length} bid(s) submitted</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Milestone schedule</h2>
        <p className="muted">Set or clear a due date for each campaign milestone. Changes are recorded in the audit log.</p>
        {milestoneMessage && <p className="muted">{milestoneMessage}</p>}
        {milestones.length === 0 ? (
          <p className="muted">No milestones configured for this campaign yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Milestone</th><th>Amount</th><th>Due date and time</th><th></th></tr>
            </thead>
            <tbody>
              {milestones.map((item) => (
                <tr key={item.id}>
                  <td>{item.sequence}. {item.name}</td>
                  <td>${(item.amount_cents / 100).toLocaleString()}</td>
                  <td>
                    <input
                      aria-label={'Due date for ' + item.name}
                      type="datetime-local"
                      value={dueDateDrafts[item.id] ?? toLocalDateTime(item.due_at)}
                      onChange={(event) => setDueDateDrafts((drafts) => ({
                        ...drafts,
                        [item.id]: event.target.value,
                      }))}
                    />
                  </td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => saveMilestoneDueDate(item.id)}
                      disabled={savingMilestoneId === item.id}
                    >
                      {savingMilestoneId === item.id ? 'Saving…' : 'Save deadline'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Bid review</h2>
        {bids.length === 0 ? (
          <p className="muted">No bids for this campaign.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Advocate</th><th>Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {bids.map((b) => (
                <tr key={b.id}>
                  <td>{b.advocate_id}</td>
                  <td>${(b.amount_cents / 100).toLocaleString()}</td>
                  <td>{b.status}</td>
                  <td>
                    {b.status === 'SUBMITTED' && (
                      <button className="btn primary" onClick={() => selectBid(b.id)} disabled={campaign?.status !== 'BID_REVIEW' || rfp?.status !== 'OPEN'}>
                        Select
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Advocate verification</h2>
        {advocates.length === 0 ? (
          <p className="muted">No advocate profiles yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Firm</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {advocates.map((a) => (
                <tr key={a.id}>
                  <td>{a.firm_name}</td>
                  <td>{a.verification_status}</td>
                  <td>
                    {a.verification_status !== 'verified' && (
                      <button
                        className="btn primary"
                        onClick={() => verifyAdvocate(a.id, 'verified')}
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Contracts</h2>
        {contracts.length === 0 ? (
          <p className="muted">No contract yet. Select a bid to create one.</p>
        ) : (
          contracts.map((item) => (
            <p key={item.id}>
              <strong>{item.id}</strong> · {item.status} · Advocate {item.advocate_id}
            </p>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Deliverables</h2>
        {deliverables.length === 0 ? (
          <p className="muted">No deliverables submitted for this campaign.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Milestone</th><th>Status</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {deliverables.map((d) => (
                <tr key={d.id}>
                  <td>{d.campaign_milestones?.name || d.milestone_id}</td>
                  <td>{d.status}</td>
                  <td>{d.submitted_at ? new Date(d.submitted_at).toLocaleString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Ratification</h2>
        <p className="muted">Thresholds: 60% quorum, 85% affirmative approval.</p>
        {ballot ? (
          <>
            <p>Ballot: {ballot.status}</p>
            <button className="btn primary" onClick={finalize}>Finalize ballot</button>
          </>
        ) : (
          <p>No ballot found for this campaign.</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Audit log</h2>
        {auditEvents.length === 0 ? (
          <p className="muted">No audit events recorded.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Event</th><th>Entity</th><th>Details</th><th>Time</th></tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id}>
                  <td>{event.event_type}</td>
                  <td>{event.entity_type}{event.entity_id && <small> · {event.entity_id}</small>}</td>
                  <td><code>{JSON.stringify(event.payload || {})}</code></td>
                  <td>{event.created_at ? new Date(event.created_at).toLocaleString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Disputes</h2>
        <p className="muted">Review and resolve deliverable disputes before release.</p>
        <Link href="/admin/disputes" className="btn">Open dispute queue</Link>
      </div>
    </>
  );
}
