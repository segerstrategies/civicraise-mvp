'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

export default function Contracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
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
          setMessage('Sign in to view your contracts.');
          return;
        }

        const { data, error } = await supabase
          .from('contracts')
          .select('*,rfps(title,slug,campaign_id),advocate_profiles(firm_name)')
          .eq('advocate_id', user.id)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (error) setMessage(error.message);
        else setContracts(data || []);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load contracts.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContracts();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      const status = String(contract.status || '').toUpperCase();
      const title = String(contract.rfps?.title || '').toLowerCase();
      return (statusFilter === 'ALL' || status === statusFilter)
        && (!normalizedQuery || title.includes(normalizedQuery));
    });
  }, [contracts, query, statusFilter]);

  return (
    <>
      <div className="eyebrow">ADVOCATE WORKSPACE</div>
      <h1>Contracts</h1>
      {message && (
        <div className="notice" role={loading ? 'status' : 'alert'}>
          {message}
          {message.toLowerCase().includes('sign in') && <> <Link href="/auth">Sign in</Link></>}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="muted">Loading contracts…</p></div>
      ) : contracts.length === 0 ? (
        <div className="card">
          <p className="muted">No contracts yet. <Link href="/advocate/rfps">View open RFPs.</Link></p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="grid two" style={{ alignItems: 'end' }}>
              <label>
                Search contracts
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by RFP title"
                />
              </label>
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="ALL">All statuses</option>
                  {[...new Set(contracts.map((contract) => String(contract.status || '').toUpperCase()))]
                    .filter(Boolean)
                    .sort()
                    .map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            </div>
            <p className="muted" aria-live="polite">Showing {visibleContracts.length} of {contracts.length} contracts.</p>
          </div>

          {visibleContracts.length === 0 ? (
            <div className="card">
              <p className="muted">No contracts match these filters.</p>
              <button type="button" className="btn" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid">
              {visibleContracts.map((contract) => (
                <article className="card" key={contract.id}>
                  <h2>{contract.rfps?.title || 'Advocacy contract'}</h2>
                  <p>Status: <strong>{String(contract.status).replace(/_/g, ' ')}</strong></p>
                  {contract.rfps?.slug && (
                    <p><Link href={'/advocate/rfps/' + contract.rfps.slug}>View RFP details</Link></p>
                  )}
                  <Link className="btn primary" href={'/advocate/deliverables/' + contract.id}>
                    Manage deliverables
                  </Link>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
