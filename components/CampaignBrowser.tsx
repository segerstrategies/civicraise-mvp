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

    function syncSavedCampaigns(event: StorageEvent) {
      if (event.key !== 'civicraise:saved-campaigns') return;
      try {
        const stored = JSON.parse(event.newValue || '[]');
        setSavedIds(Array.isArray(stored) ? Array.from(new Set(stored.filter((value) => typeof value === 'string'))) : []);
      } catch {
        setSavedIds([]);
      }
    }
    window.addEventListener('storage', syncSavedCampaigns);

    async function loadInterests() {
      try {
        const supabase = createClient();
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const [{ data: profile }, { data: stances }] = await Promise.all([
          supabase.from('profiles').select('interest_areas').eq('id', user.id).maybeSingle(),
          supabase.from('legislation_stances').select('bill_code').eq('user_id', user.id),
        ]);
        if (cancelled) return;
        const declaredAreas = Array.isArray(profile?.interest_areas) ? profile.interest_areas : [];
        const billCodes = (stances || []).map((item: any) => item.bill_code).filter(Boolean);
        if (billCodes.length) {
          const { data: matchingLegislation } = await supabase
            .from('legislation_items')
            .select('issue_areas')
            .in('bill_code', billCodes)
            .eq('published', true);
          if (cancelled) return;
          const stanceAreas = (matchingLegislation || []).flatMap((item: any) =>
            Array.isArray(item.issue_areas) ? item.issue_areas : []
          );
          setInterestAreas(Array.from(new Set([...declaredAreas, ...stanceAreas])));
        } else {
          setInterestAreas(declaredAreas);
        }
      } catch {
        // Recommendations are optional and do not block the public campaign list.
      }
    }

    void loadInterests();
    return () => { cancelled = true; window.removeEventListener('storage', syncSavedCampaigns); };
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
        ...(campaign.issue_areas || []),
        campaign.status,
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
        return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0)
          || String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (sortOrder === 'most-funded') return percentFunded(b) - percentFunded(a)
        || String(a.title || '').localeCompare(String(b.title || ''));
      if (sortOrder === 'near-goal') {
        const remainingRatio = (campaign: Campaign) => {
          const goal = cents(campaign.goal_cents, campaign.goal);
          return goal > 0 ? Math.max(0, goal - cents(campaign.raised_cents, campaign.raised)) / goal : Number.POSITIVE_INFINITY;
        };
        return remainingRatio(a) - remainingRatio(b)
          || String(a.title || '').localeCompare(String(b.title || ''));
      }
      return interestScore(b) - interestScore(a)
        || percentFunded(b) - percentFunded(a)
        || String(a.title || '').localeCompare(String(b.title || ''));
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
          <button type="button" className={savedOnly ? 'btn primary' : 'btn'} aria-pressed={savedOnly} onClick={() => setSavedOnly((current) => !current)}>
            {savedOnly ? 'Showing saved campaigns' : 'Show saved campaigns'} ({savedIds.length})
          </button>
          <Link className="btn" href="/legislation">Support or oppose legislation</Link>
          <Link className="btn" href="/campaigns/propose">Propose a campaign</Link>
        </div>
        <p className="muted" role="status" aria-live="polite">
          Showing {filteredCampaigns.length} of {campaigns.length} campaigns{savedOnly ? ' · saved only' : ''}.
        </p>
        {interestAreas.length === 0 && (
          <p className="muted">Add issue interests in your <Link href="/profile">profile</Link> to personalize recommendations.</p>
        )}
        {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="card">
          <h2>No matching campaigns</h2>
          <p className="muted">{savedOnly && savedIds.length === 0 ? 'You have not saved any campaigns yet.' : 'Try a different search, issue area, or pledge status filter.'}</p>
          <button
            type="button"
            className="btn"
            onClick={() => { setQuery(''); setPledgeFilter('all'); setIssueFilter('all'); setSavedOnly(false); setSortOrder('recommended'); }}
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
                <div className="eyebrow">{campaign.bill || 'Civic campaign'} · {String(campaign.status || 'STATUS UNAVAILABLE').toUpperCase()}</div>
                <h2>{campaign.title || 'Untitled campaign'}</h2>
                <p className="muted">{campaign.description}</p>
                <p><strong>{raisedAmount}</strong>{goal > 0 ? <> of {goalAmount}</> : ' raised'}</p>
                {goal > 0 && (
                  <p className="muted">{Math.round(progress)}% funded · {goalAmount === raisedAmount ? 'Goal reached' : (Math.max(0, goal - raised) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) + ' to go'}</p>
                )}
                {goal > 0 && (
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`${campaign.title || 'Campaign'} funding progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                  >
                    <div style={{ width: progress + '%' }} />
                  </div>
                )}
                <div className="actions">
                  <Link className="btn primary" href={'/campaigns/' + (campaign.slug || campaign.id)}>
                    View campaign
                  </Link>
                  <button type="button" className="btn" aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${campaign.title || 'campaign'}`} onClick={() => toggleSaved(campaign)}>
                    {saved ? 'Saved' : 'Save'}
                  </button>
                  <button type="button" className="btn" aria-label={`Share ${campaign.title || 'campaign'}`} onClick={() => void shareCampaign(campaign)}>
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
