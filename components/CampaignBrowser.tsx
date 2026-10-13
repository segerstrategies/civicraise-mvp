'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Campaign = {
  id?: string;
  slug?: string;
  title?: string;
  bill?: string;
  status?: string;
  description?: string;
  raised_cents?: number;
  raised?: number;
  goal_cents?: number;
  goal?: number;
};

function cents(value: number | undefined, legacyValue: number | undefined) {
  if (value !== undefined && value !== null) return Number(value) || 0;
  return (Number(legacyValue) || 0) * 100;
}

export default function CampaignBrowser({ campaigns }: { campaigns: Campaign[] }) {
  const [query, setQuery] = useState('');
  const [pledgeFilter, setPledgeFilter] = useState<'all' | 'open' | 'closed'>('all');

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const status = String(campaign.status || '').toUpperCase();
      const acceptingPledges = ['PUBLISHED', 'FUNDING'].includes(status);
      const matchesStatus = pledgeFilter === 'all'
        || (pledgeFilter === 'open' && acceptingPledges)
        || (pledgeFilter === 'closed' && !acceptingPledges);
      const searchableText = [
        campaign.title,
        campaign.bill,
        campaign.description,
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [campaigns, pledgeFilter, query]);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="grid two" style={{ alignItems: 'end' }}>
          <label>
            Search campaigns
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by bill, title, or objective"
            />
          </label>
          <label>
            Pledge status
            <select
              value={pledgeFilter}
              onChange={(event) => setPledgeFilter(event.target.value as typeof pledgeFilter)}
            >
              <option value="all">All campaigns</option>
              <option value="open">Accepting pledges</option>
              <option value="closed">Pledges closed</option>
            </select>
          </label>
        </div>
        <p className="muted" aria-live="polite">
          Showing {filteredCampaigns.length} of {campaigns.length} campaigns.
        </p>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="card">
          <h2>No matching campaigns</h2>
          <p className="muted">Try a different search or pledge status filter.</p>
          <button
            type="button"
            className="btn"
            onClick={() => { setQuery(''); setPledgeFilter('all'); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid">
          {filteredCampaigns.map((campaign) => {
            const raised = cents(campaign.raised_cents, campaign.raised);
            const goal = cents(campaign.goal_cents, campaign.goal);
            const progress = goal > 0 ? Math.min(100, raised / goal * 100) : 0;
            const raisedAmount = (raised / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
            const goalAmount = (goal / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

            return (
              <article className="card" key={campaign.id || campaign.slug}>
                <div className="eyebrow">{campaign.bill} · {String(campaign.status).toUpperCase()}</div>
                <h2>{campaign.title}</h2>
                <p className="muted">{campaign.description}</p>
                <p><strong>{raisedAmount}</strong> of {goalAmount}</p>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Campaign funding progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <div style={{ width: progress + '%' }} />
                </div>
                <div className="actions">
                  <Link className="btn primary" href={'/campaigns/' + (campaign.slug || campaign.id)}>
                    View campaign
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
