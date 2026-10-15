import { createClient } from '@/lib/supabase-server';
import { campaigns as demo } from '@/lib/mock-data';
import LegislationFeed from '@/components/LegislationFeed';

export default async function LegislationPage() {
  const supabase = await createClient();
  let campaigns: any[] = (demo as any[]).map((campaign) => ({
    ...campaign,
    issue_areas: campaign.issue_areas || ['Agriculture & food systems'],
  }));
  let userId: string | null = null;
  let interests: string[] = [];
  let stances: Array<{ bill_code: string; stance: 'SUPPORT' | 'OPPOSE' }> = [];

  if (supabase) {
    const { data } = await supabase
      .from('campaigns')
      .select('id,slug,title,bill,description,issue_areas,status,created_at')
      .order('created_at', { ascending: false });

    if (data) campaigns = data;

    const { data: auth } = await supabase.auth.getUser();
    userId = auth.user?.id ?? null;
    if (userId) {
      const [{ data: profile }, { data: ownStances }] = await Promise.all([
        supabase.from('profiles').select('interest_areas').eq('id', userId).maybeSingle(),
        supabase.from('legislation_stances').select('bill_code,stance').eq('user_id', userId),
      ]);
      interests = Array.isArray(profile?.interest_areas) ? profile.interest_areas : [];
      stances = (ownStances || []) as typeof stances;
    }
  }

  const visibleCampaigns = campaigns.filter((campaign) =>
    campaign.bill && !['DRAFT', 'UNDER_REVIEW'].includes(String(campaign.status).toUpperCase())
  );

  return (
    <>
      <div className="eyebrow">CIVIC ACTION · FREE</div>
      <h1>Legislation that matters to you</h1>
      <p className="muted">Explore bills connected to CivicRaise campaigns. Support or oppose a bill without pledging money.</p>
      <LegislationFeed
        campaigns={visibleCampaigns}
        userId={userId}
        interests={interests}
        initialStances={stances}
      />
    </>
  );
}
