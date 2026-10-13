'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

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
  issue_areas?: string[];
  created_at?: string;
};

function cents(value: number | undefined, legacyValue: number | undefined) {
  if (value !== undefined && value !== null) return Number(value) || 0;
  return (Number(legacyValue) || 0) * 100;
}

export default function CampaignBrowser({ campaigns }: { campaigns: Campaign[] }) {
  const [query, setQuery] = useState('');
  const [pledgeFilter, setPledgeFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [issueFilter, setIssueFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'recommended' | 'newest' | 'most-funded' | 'near-goal'>('recommended');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [interestAreas, setInterestAreas] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    try {
      const stored = JSON.parse(window.localStorage.getItem('civicraise:saved-campaigns') || '[]');
      if (!cancelled && Array.isArray(stored)) setSavedIds(stored.filter((value) => typeof value === 'string'));
    } catch {
      // Ignore invalid or unavailable local storage; campaign browsing still works.
    }

    async function loadInterests() {
      try {
        const supabase = createClient();
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('profiles')
          .select('interest_areas')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled) setInterestAreas(Array.isArray(data?.interest_areas) ? data.interest_areas : []);
      } catch {
        // Recommendations are optional and do not block the public campaign list.
      }
    }

    void loadInterests();
    return () => { cancelled = true; };
  }, []);

  function toggleSaved(campaign: Campaign) {
    const id = String(campaign.id || campaign.slug || '');
    if (!id) return;
    const next = savedIds.includes(id) ? savedIds.filter((item) => item !== id) : [...savedIds, id];
    setSavedIds(next);
    try {
      window.localStorage.setItem('civicraise:saved-campaigns', JSON.stringify(next));
    } catch {
      setMessage('Saved campaigns are unavailable in this browser.');
    }
  }

  async function shareCampaign(campaign: Campaign) {
    const url = new URL('/campaigns/' + (campaign.slug || campaign.id), window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: campaign.title || 'CivicRaise campaign', url });
        setMessage('Campaign shared.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage('Campaign link copied.');
      } else {
        setMessage('Share this campaign: ' + url);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Could not share the campaign. Copy this link: ' + url);
    }
  }

  const availableIssueAreas = useMemo(() => Array.from(new Set(
    campaigns.flatMap((campaign) => campaign.issue_areas || [])
  )).sort((a, b) => a.localeCompare(b)), [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = campaigns.filter((campaign) => {
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
      const campaignId = String(campaign.id || campaign.slug || '');
      const matchesIssue = issueFilter === 'all' || (campaign.issue_areas || []).some((area) => area.toLowerCase() === issueFilter.toLowerCase());

      return matchesStatus
        && matchesIssue
        && (!savedOnly || savedIds.includes(campaignId))
        && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });

    const percentFunded = (campaign: Campaign) => {
      const goal = cents(campaign.goal_cents, campaign.goal);
      return goal > 0 ? cents(campaign.raised_cents, campaign.raised) / goal : 0;
    };
    const interestScore = (campaign: Campaign) =>
      (campaign.issue_areas || []).filter((area) => interestAreas.includes(area)).length;

    return filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0);
      }
      if (sortOrder === 'most-funded') return percentFunded(b) - percentFunded(a);
      if (sortOrder === 'near-goal') {
        const remainingRatio = (campaign: Campaign) => {
          const goal = cents(campaign.goal_cents, campaign.goal);
          return goal > 0 ? Math.max(0, goal - cents(campaign.raised_cents, campaign.raised)) / goal : Number.POSITIVE_INFINITY;
        };
        return remainingRatio(a) - remainingRatio(b);
      }
      return interestScore(b) - interestScore(a) || percentFunded(b) - percentFunded(a);
    });
  }, [campaigns, interestAreas, issueFilter, pledgeFilter, query, savedIds, savedOnly, sortOrder]);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, alignItems: 'end' }}>
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
          <label>
            Issue area
            <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)}>
              <option value="all">All issue areas</option>
              {availableIssueAreas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
          <label>
            Sort campaigns
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}>
              <option value="recommended">Recommended for you</option>
              <option value="newest">Recently added</option>
              <option value="most-funded">Most funded</option>
              <option value="near-goal">Closest to goal</option>
            </select>
          </label>
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className={savedOnly ? 'btn primary' : 'btn'} onClick={() => setSavedOnly((current) => !current)}>
            {savedOnly ? 'Showing saved campaigns' : 'Show saved campaigns'} ({savedIds.length})
          </button>
        </div>
        <p className="muted" aria-live="polite">
          Showing {filteredCampaigns.length} of {campaigns.length} campaigns.
        </p>
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="card">
          <h2>No matching campaigns</h2>
          <p className="muted">Try a different search or pledge status filter.</p>
          <button
            type="button"
            className="btn"
            onClick={() => { setQuery(''); setPledgeFilter('all'); setIssueFilter('all'); setSavedOnly(false); }}
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
            const campaignId = String(campaign.id || campaign.slug || '');
            const saved = savedIds.includes(campaignId);
            const raisedAmount = (raised / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
            const goalAmount = (goal / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

            return (
              <article className="card" key={campaign.id || campaign.slug}>
                <div className="eyebrow">{campaign.bill} · {String(campaign.status).toUpperCase()}</div>
                <h2>{campaign.title}</h2>
                <p className="muted">{campaign.description}</p>
                <p><strong>{raisedAmount}</strong> of {goalAmount}</p>
                {goal > 0 && (
                  <p className="muted">{Math.round(progress)}% funded · {goalAmount === raisedAmount ? 'Goal reached' : (Math.max(0, goal - raised) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) + ' to go'}</p>
                )}
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
                  <button type="button" className="btn" aria-pressed={saved} onClick={() => toggleSaved(campaign)}>
                    {saved ? 'Saved' : 'Save'}
                  </button>
                  <button type="button" className="btn" onClick={() => void shareCampaign(campaign)}>
                    Share
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
