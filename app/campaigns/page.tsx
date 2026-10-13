import { createClient } from '@/lib/supabase-server';
import { campaigns as demo } from '@/lib/mock-data';
import CampaignBrowser from '@/components/CampaignBrowser';

export default async function Campaigns() {
  const supabase = await createClient();
  let campaigns: any[] = demo;

  if (supabase) {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (data?.length) campaigns = data;
  }

  return (
    <>
      <h1>Campaigns</h1>
      <p className="muted">MVP campaigns use test pledges. No real money is processed.</p>
      <CampaignBrowser campaigns={campaigns} />
    </>
  );
}
