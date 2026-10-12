'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

function formatMoney(cents: number) {
  return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'No date set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function deadlineLabel(value?: string | null) {
  if (!value) return 'No deadline announced';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'Deadline unavailable';
  const days = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Deadline passed';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return days + ' days left';
}

function formatStatus(value?: string | null) {
  if (!value) return 'Status unavailable';
  const status = String(value).toUpperCase();
  const labels: Record<string, string> = {
    SUBMITTED: 'Awaiting decision',
    SELECTED: 'Selected',
    REJECTED: 'Not selected',
  };
  return labels[status] || status.replace(/_/g, ' ').toLowerCase();
}

function deliverableStatus(value?: string | null) {
  return String(value || '').toUpperCase() === 'SUBMITTED'
    ? 'Awaiting review'
    : formatStatus(value);
}

export default function LobbyistDashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [openRfps, setOpenRfps] = useState<any[]>([]);
  const [openRfpCount, setOpenRfpCount] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const sb = createClient();
        if (!sb) {
          setMessage('Lobbyist data is unavailable because Supabase is not configured.');
          return;
        }

        const { data: { user: currentUser }, error: authError } = await sb.auth.getUser();
        if (cancelled) return;
        if (authError) {
          setMessage(authError.message);
          return;
        }
        setUser(currentUser);
        if (!currentUser) return;

        const [profileResult, bidsResult, contractsResult, rfpResult] = await Promise.all([
          sb.from('advocate_profiles')
            .select('firm_name,verification_status,registration_status')
            .eq('id', currentUser.id)
            .maybeSingle(),
          sb.from('bids')
            .select('id,amount_cents,status,created_at,rfps(title,slug)')
            .eq('advocate_id', currentUser.id)
            .order('created_at', { ascending: false }),
          sb.from('contracts')
            .select('id,status,created_at,rfps(title,slug,campaign_id)')
            .eq('advocate_id', currentUser.id)
            .order('created_at', { ascending: false }),
          sb.from('rfps')
            .select('id,title,slug,budget_cents,deadline', { count: 'exact' })
            .eq('status', 'OPEN')
            .order('deadline', { ascending: true, nullsFirst: false })
            .limit(5),
        ]);

        if (cancelled) return;

        const firstError = profileResult.error || bidsResult.error || contractsResult.error || rfpResult.error;
        if (firstError) setMessage(firstError.message);

        setProfile(profileResult.data);
        setBids(bidsResult.data || []);
        setContracts(contractsResult.data || []);
        setOpenRfps(rfpResult.data || []);
        setOpenRfpCount(rfpResult.count || 0);

        const contractIds = (contractsResult.data || []).map((contract: any) => contract.id);
        if (contractIds.length) {
          const { data, error } = await sb.from('deliverables')
            .select('id,status,submitted_at,contract_id')
            .in('contract_id', contractIds)
            .order('submitted_at', { ascending: false });
          if (cancelled) return;
          if (error) setMessage(error.message);
          else setDeliverables(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load the lobbyist dashboard.');
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

  if (!loading && !user) {
    return (
      <>
        <div className="eyebrow">ADVOCATE WORKSPACE</div>
        <h1>Lobbyist dashboard</h1>
        <div className="card">
          <p className="muted">{message || 'Sign in to view your bids, contracts, and deliverables.'}</p>
          <Link href="/auth" className="btn primary">Sign in</Link>
        </div>
      </>
    );
  }

  const activeContracts = contracts.filter((contract) =>
    ['ACTIVE', 'IN_PROGRESS'].includes(String(contract.status).toUpperCase())
  );
  const pendingDeliverables = deliverables.filter((item) =>
    String(item.status).toUpperCase() === 'SUBMITTED'
  );

  return (
    <>
      <div className="eyebrow">ADVOCATE WORKSPACE</div>
      <h1>Lobbyist dashboard</h1>
      <p className="muted">
        {profile?.firm_name || user?.email || 'Your firm'}
        {' · '}Verification: {profile?.verification_status || 'profile not started'}
      </p>
      {message && <div className="notice">{message}</div>}
      <div className="actions">
        <Link href="/advocate/rfps" className="btn primary">Browse open RFPs</Link>
        <Link href="/advocate/contracts" className="btn">All contracts</Link>
        <Link href="/advocate" className="btn">Edit profile</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="metric">{loading ? '—' : openRfpCount}</div>
          <p className="muted">Open RFPs</p>
        </div>
        <div className="card">
          <div className="metric">{loading ? '—' : bids.length}</div>
          <p className="muted">Your bids</p>
        </div>
        <div className="card">
          <div className="metric">{loading ? '—' : activeContracts.length}</div>
          <p className="muted">Active contracts</p>
        </div>
        <div className="card">
          <div className="metric">{loading ? '—' : pendingDeliverables.length}</div>
          <p className="muted">Deliverables awaiting review</p>
        </div>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Action center</h2>
        <p className="muted">RFP deadlines, bid decisions, and deliverable follow-up.</p>
        <div className="grid two">
          <div>
            <h3>Open RFP deadlines</h3>
            {loading ? <p className="muted">Loading deadlines…</p> : openRfps.length === 0 ? (
              <p className="muted">No open RFPs right now.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {openRfps.map((rfp) => (
                  <div key={rfp.id}>
                    <strong><Link href={'/advocate/rfps/' + rfp.slug}>{rfp.title}</Link></strong>
                    <p className="muted">
                      Deadline: {formatDate(rfp.deadline)} · {deadlineLabel(rfp.deadline)}
                    </p>
                    <p className="muted">Budget: {formatMoney(rfp.budget_cents)}</p>
                  </div>
                ))}
                {openRfpCount > openRfps.length && (
                  <Link href="/advocate/rfps">View all {openRfpCount} open RFPs</Link>
                )}
              </div>
            )}
          </div>

          <div>
            <h3>Recent bids and decisions</h3>
            {loading ? <p className="muted">Loading bids…</p> : bids.length === 0 ? (
              <p className="muted">No bids yet. Browse an open RFP to submit one.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {bids.slice(0, 5).map((bid) => (
                  <div key={bid.id}>
                    <strong>
                      {bid.rfps?.slug
                        ? <Link href={'/advocate/rfps/' + bid.rfps.slug}>{bid.rfps?.title || 'RFP'}</Link>
                        : (bid.rfps?.title || 'RFP')}
                    </strong>
                    <p className="muted">
                      {formatStatus(bid.status)} · {formatMoney(bid.amount_cents)}
                    </p>
                    <p className="muted">Submitted {formatDate(bid.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3>Deliverable status</h3>
            {loading ? <p className="muted">Loading deliverables…</p> : deliverables.length === 0 ? (
              <p className="muted">No deliverables submitted yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {deliverables.slice(0, 5).map((item) => {
                  const contract = contracts.find((row) => row.id === item.contract_id);
                  return (
                    <div key={item.id}>
                      <strong>{contract?.rfps?.title || 'Advocacy deliverable'}</strong>
                      <p className="muted">
                        {deliverableStatus(item.status)}
                        {item.submitted_at ? ' · submitted ' + formatDate(item.submitted_at) : ''}
                      </p>
                      <Link href={'/advocate/deliverables/' + item.contract_id}>Open contract</Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2>Active contracts</h2>
          <Link href="/advocate/contracts">View all</Link>
        </div>
        {loading ? <p className="muted">Loading contracts…</p> : activeContracts.length === 0 ? (
          <p className="muted">No active contracts yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {activeContracts.slice(0, 5).map((contract) => (
              <div key={contract.id}>
                <strong>{contract.rfps?.title || 'Advocacy contract'}</strong>
                <p className="muted">Status: {formatStatus(contract.status)}</p>
                <Link href={'/advocate/deliverables/' + contract.id}>Manage deliverables</Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
