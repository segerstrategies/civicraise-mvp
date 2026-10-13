'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

export default function DisputesAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const supabase = createClient();
      if (!supabase) {
        setMessage('Supabase is not configured.');
        return;
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setMessage(authError.message);
        return;
      }
      if (!user) {
        setMessage('Sign in to access the dispute queue.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(profileError.message);
        return;
      }
      if (profile?.role !== 'admin') {
        setMessage('Admin access is required to view disputes.');
        return;
      }
      setIsAdmin(true);

      const { data, error } = await supabase
        .from('disputes')
        .select('*,profiles(full_name),deliverables(id,description)')
        .order('created_at', { ascending: false });

      if (error) {
        setMessage(error.message);
        return;
      }
      setRows(data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load disputes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, resolution: 'CURED' | 'UPHELD') {
    if (busyId) return;
    setBusyId(id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId: id, resolution }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.message || (response.ok ? 'Dispute updated.' : 'Dispute could not be updated.'));
      if (response.ok) await load();
    } catch {
      setMessage('Unable to reach CivicRaise. Check your connection and try again.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <div className="eyebrow">ADMIN · DISPUTES</div>
      <h1>Dispute queue</h1>
      {message && (
        <div className="notice" role="alert">
          {message}
          {message.toLowerCase().includes('sign in') && <> <Link href="/auth">Sign in</Link></>}
          {message.toLowerCase().includes('could not load') && (
            <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="muted">Loading disputes…</p></div>
      ) : !isAdmin ? (
        <div className="card"><p className="muted">The dispute queue is available to admins.</p></div>
      ) : rows.length === 0 ? (
        <div className="card"><p className="muted">No disputes are waiting for review.</p></div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Raised by</th><th>Reason</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((dispute) => {
                const deliverable = Array.isArray(dispute.deliverables)
                  ? dispute.deliverables[0]
                  : dispute.deliverables;
                return (
                  <tr key={dispute.id}>
                    <td>{dispute.profiles?.full_name || dispute.raised_by}</td>
                    <td>
                      {dispute.reason}
                      {deliverable?.description && (
                        <details>
                          <summary>View submitted work</summary>
                          <p>{deliverable.description}</p>
                        </details>
                      )}
                    </td>
                    <td>{String(dispute.status).replace(/_/g, ' ')}</td>
                    <td>
                      {dispute.status === 'OPEN' && (
                        <div className="actions">
                          <button
                            className="btn"
                            onClick={() => resolve(dispute.id, 'CURED')}
                            disabled={Boolean(busyId)}
                          >
                            {busyId === dispute.id ? 'Saving…' : 'Accept deliverable'}
                          </button>
                          <button
                            className="btn"
                            onClick={() => resolve(dispute.id, 'UPHELD')}
                            disabled={Boolean(busyId)}
                          >
                            {busyId === dispute.id ? 'Saving…' : 'Require a cure'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message && isAdmin && !loading && !message.toLowerCase().includes('required') && (
        <div className="notice" role="status" aria-live="polite">{message}</div>
      )}
    </>
  );
}
