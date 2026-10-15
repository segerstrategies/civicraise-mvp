import { createClient } from '@/lib/supabase-server';
import LegislationFeed from '@/components/LegislationFeed';

export default async function LegislationPage() {
  const supabase = await createClient();
  let legislation: any[] = [];
  let userId: string | null = null;
  let interests: string[] = [];
  let stances: Array<{ bill_code: string; stance: 'SUPPORT' | 'OPPOSE' }> = [];

  if (supabase) {
    const { data } = await supabase
      .from('legislation_items')
      .select('bill_code,title,summary,issue_areas,source_url,bill_status,latest_action,verified_at')
      .eq('published', true)
      .order('title', { ascending: true });

    if (data) legislation = data;

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

  return (
    <>
      <div className="eyebrow">CIVIC ACTION · FREE</div>
      <h1>Legislation that matters to you</h1>
      <p className="muted">Explore legislation by the issues you care about. Support or oppose a bill for free, then start a new campaign around it.</p>
      <LegislationFeed
        legislation={legislation}
        userId={userId}
        interests={interests}
        initialStances={stances}
      />
    </>
  );
}
