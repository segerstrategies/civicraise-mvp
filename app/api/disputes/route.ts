import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
export async function POST(req: Request) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Sign in required.' }, { status: 401 });
  const { deliverableId, reason } = await req.json().catch(() => ({}));
  if (!deliverableId || !String(reason || '').trim()) return NextResponse.json({ message: 'Deliverable and reason are required.' }, { status: 400 });
  const { data: d } = await sb.from('deliverables').select('id,contracts(rfps(campaign_id))').eq('id', deliverableId).maybeSingle();
  if (!d) return NextResponse.json({ message: 'Deliverable not found.' }, { status: 404 });
  const { data: backer } = await sb.from('pledges').select('id').eq('campaign_id', (d.contracts as any)?.rfps?.campaign_id).eq('user_id', user.id).limit(1).maybeSingle();
  if (!backer) return NextResponse.json({ message: 'Only campaign backers can raise a deliverable dispute.' }, { status: 403 });
  const { data: dispute, error } = await sb.from('disputes').insert({ deliverable_id: deliverableId, raised_by: user.id, reason: String(reason).trim(), status: 'OPEN' }).select().single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  await sb.from('deliverables').update({ status: 'DISPUTED' }).eq('id', deliverableId);
  await sb.from('campaigns').update({ status: 'DISPUTED' }).eq('id', (d.contracts as any)?.rfps?.campaign_id);
  await sb.rpc('log_audit', { p_event: 'DISPUTE_RAISED', p_entity_type: 'deliverable', p_entity_id: deliverableId, p_payload: { dispute_id: dispute.id } });
  return NextResponse.json({ message: 'Dispute recorded and campaign frozen for review.', disputeId: dispute.id });
}
