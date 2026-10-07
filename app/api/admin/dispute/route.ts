import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
export async function POST(req: Request) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Sign in required.' }, { status: 401 });
  const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { disputeId, resolution } = await req.json().catch(() => ({}));
  if (!disputeId || !['CURED', 'UPHELD', 'RESOLVED'].includes(resolution)) return NextResponse.json({ message: 'Dispute and valid resolution are required.' }, { status: 400 });
  const { data: dispute } = await sb.from('disputes').select('*,deliverables(id,contract_id,contracts(rfps(campaign_id)))').eq('id', disputeId).maybeSingle();
  if (!dispute) return NextResponse.json({ message: 'Dispute not found.' }, { status: 404 });
  const campaignId = (dispute.deliverables as any)?.contracts?.rfps?.campaign_id;
  const deliverableId = (dispute.deliverables as any)?.id;
  const { error } = await sb.from('disputes').update({ status: resolution, resolved_at: new Date().toISOString(), resolved_by: user.id }).eq('id', disputeId);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  if (deliverableId) await sb.from('deliverables').update({ status: resolution === 'UPHELD' ? 'REJECTED' : 'ACCEPTED' }).eq('id', deliverableId);
  if (campaignId) await sb.from('campaigns').update({ status: resolution === 'UPHELD' ? 'CURE_REQUIRED' : 'BACKER_REVIEW' }).eq('id', campaignId);
  await sb.rpc('log_audit', { p_event: 'DISPUTE_RESOLVED', p_entity_type: 'dispute', p_entity_id: disputeId, p_payload: { resolution } });
  return NextResponse.json({ message: `Dispute ${resolution.toLowerCase()}.` });
}
