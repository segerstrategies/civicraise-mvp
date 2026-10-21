import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { campaigns as demo } from '@/lib/mock-data';
import CampaignBrowser from '@/components/CampaignBrowser';

export default async function Campaigns() {
  const supabase = await createClient();
  let campaigns: any[] = demo;
  let loadError = false;

  if (supabase) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      campaigns = [];
      loadError = true;
    } else {
      campaigns = data || [];
    }
  }

  return (
    <>
      <h1>Campaigns</h1>
      <p className="muted">
        {supabase
          ? 'MVP campaigns use test pledges. No real money is processed.'
          : 'Showing sample campaigns because the account service is not configured. Sample pledges are for demo purposes only.'}
      </p>
      {loadError ? (
        <div className="card" role="alert">
          <h2>Campaigns could not be loaded</h2>
          <p className="muted">Refresh the page to try again. You can still explore legislation or propose a campaign.</p>
          <div className="actions">
            <Link className="btn" href="/legislation">Explore legislation</Link>
            <Link className="btn" href="/campaigns/propose">Propose a campaign</Link>
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <h2>No campaigns are available right now</h2>
          <p className="muted">Explore federal legislation or propose a campaign for CivicRaise to review.</p>
          <div className="actions">
            <Link className="btn" href="/legislation">Explore legislation</Link>
            <Link className="btn primary" href="/campaigns/propose">Propose a campaign</Link>
          </div>
        </div>
      ) : (
        <CampaignBrowser campaigns={campaigns} />
      )}
    </>
  );
}
