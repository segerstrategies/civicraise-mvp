import { createClient } from '@/lib/supabase-server';
import { rfps as demo } from '@/lib/mock-data';
import RfpBrowser from '@/components/RfpBrowser';

export default async function Rfps() {
  const supabase = await createClient();
  let rfps: any[] = demo;

  if (supabase) {
    const { data } = await supabase
      .from('rfps')
      .select('*')
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false });

    if (data?.length) rfps = data;
  }

  return (
    <>
      <div className="eyebrow">ADVOCATE MARKETPLACE</div>
      <h1>Open RFPs</h1>
      <p className="muted">Test marketplace. Production contracts and payment rails are not active.</p>
      <RfpBrowser rfps={rfps} />
    </>
  );
}
