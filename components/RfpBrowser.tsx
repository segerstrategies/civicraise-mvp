'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Rfp = {
  id?: string;
  slug?: string;
  title?: string;
  campaign?: string;
  status?: string;
  budget_cents?: number;
  budget?: number;
  deadline?: string | null;
};

function cents(rfp: Rfp) {
  if (rfp.budget_cents !== undefined && rfp.budget_cents !== null) {
    return Number(rfp.budget_cents) || 0;
  }
  return (Number(rfp.budget) || 0) * 100;
}

function formatDeadline(value?: string | null) {
  if (!value) return 'No deadline announced';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Deadline unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RfpBrowser({ rfps }: { rfps: Rfp[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'deadline' | 'budget-low' | 'budget-high'>('deadline');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('civicraise:saved-rfps') || '[]');
      if (Array.isArray(stored)) setSavedIds(stored.filter((value) => typeof value === 'string'));
    } catch {
      // RFP browsing does not depend on browser storage.
    }
  }, []);

  function toggleSaved(rfp: Rfp) {
    const id = String(rfp.id || rfp.slug || '');
    if (!id) return;
    const next = savedIds.includes(id) ? savedIds.filter((value) => value !== id) : [...savedIds, id];
    setSavedIds(next);
    try { window.localStorage.setItem('civicraise:saved-rfps', JSON.stringify(next)); } catch { /* Keep this session's state. */ }
  }

  const visibleRfps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rfps
      .filter((rfp) => (!savedOnly || savedIds.includes(String(rfp.id || rfp.slug || '')))
        && [rfp.title, rfp.campaign].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        if (sort === 'budget-low') return cents(left) - cents(right);
        if (sort === 'budget-high') return cents(right) - cents(left);

        const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
        const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
        return leftDeadline - rightDeadline;
      });
  }, [rfps, query, savedIds, savedOnly, sort]);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="grid two" style={{ alignItems: 'end' }}>
          <label>
            Search open RFPs
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by RFP or campaign"
            />
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="deadline">Deadline (soonest first)</option>
              <option value="budget-low">Budget (lowest first)</option>
              <option value="budget-high">Budget (highest first)</option>
            </select>
          </label>
        </div>
        <button type="button" className="btn" style={{ marginTop: 12 }} aria-pressed={savedOnly} onClick={() => setSavedOnly((current) => !current)}>
          {savedOnly ? 'Showing saved RFPs' : 'Show saved RFPs'} ({savedIds.length})
        </button>
        <p className="muted" aria-live="polite">
          Showing {visibleRfps.length} of {rfps.length} open RFPs.
        </p>
      </div>

      {visibleRfps.length === 0 ? (
        <div className="card">
          <h2>{rfps.length === 0 ? 'No open RFPs' : 'No matching RFPs'}</h2>
          <p className="muted">
            {rfps.length === 0
              ? 'Check back when campaigns publish new advocacy opportunities.'
              : 'Try changing your search.'}
          </p>
          {query && (
            <button type="button" className="btn" onClick={() => setQuery('')}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid">
          {visibleRfps.map((rfp) => (
            <article className="card" key={rfp.id || rfp.slug}>
              <div className="eyebrow">OPEN RFP</div>
              <h2>{rfp.title || rfp.campaign}</h2>
              {rfp.campaign && <p className="muted">{rfp.campaign}</p>}
              <p>Budget: {(cents(rfp) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
              <p className="muted">Deadline: {formatDeadline(rfp.deadline)}{rfp.deadline && (() => {
                const days = Math.ceil((new Date(rfp.deadline).getTime() - Date.now()) / 86400000);
                return days < 0 ? ' · Deadline passed' : days <= 7 ? ` · ${days === 0 ? 'Due today' : `Due in ${days} days`}` : '';
              })()}</p>
              <div className="actions">
                <Link className="btn primary" href={'/advocate/rfps/' + (rfp.slug || rfp.id)}>Review RFP</Link>
                <button type="button" className="btn" aria-pressed={savedIds.includes(String(rfp.id || rfp.slug || ''))} onClick={() => toggleSaved(rfp)}>
                  {savedIds.includes(String(rfp.id || rfp.slug || '')) ? 'Saved' : 'Save RFP'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
