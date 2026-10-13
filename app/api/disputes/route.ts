import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const deliverableId = typeof body?.deliverableId === 'string' ? body.deliverableId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  if (!deliverableId || reason.length < 10 || reason.length > 2000) {
    return NextResponse.json(
      { message: 'A deliverable and a 10–2,000 character reason are required.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ message: 'Could not verify your session.' }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ message: 'Sign in required.' }, { status: 401 });
  }

  const { data: deliverable, error: deliverableError } = await supabase
    .from('deliverables')
    .select('id,status,contracts(rfp_id)')
    .eq('id', deliverableId)
    .maybeSingle();

  if (deliverableError) {
    return NextResponse.json({ message: 'Could not verify this deliverable.' }, { status: 400 });
  }
  if (!deliverable) {
    return NextResponse.json({ message: 'Deliverable not found.' }, { status: 404 });
  }

  const contract = Array.isArray(deliverable.contracts) ? deliverable.contracts[0] : deliverable.contracts;
  const rfpId = contract?.rfp_id;
  if (!rfpId) {
    return NextResponse.json({ message: 'Deliverable campaign could not be resolved.' }, { status: 400 });
  }

  const { data: rfp, error: rfpError } = await supabase
    .from('rfps')
    .select('campaign_id,campaigns(status)')
    .eq('id', rfpId)
    .maybeSingle();

  if (rfpError || !rfp) {
    return NextResponse.json({ message: 'Could not verify the deliverable campaign.' }, { status: 400 });
  }

  const campaign = Array.isArray(rfp.campaigns) ? rfp.campaigns[0] : rfp.campaigns;
  if (deliverable.status !== 'SUBMITTED' || campaign?.status !== 'BACKER_REVIEW') {
    return NextResponse.json(
      { message: 'Only deliverables currently under backer review can be disputed.' },
      { status: 409 }
    );
  }

  const { data: backer, error: backerError } = await supabase
    .from('pledges')
    .select('id')
    .eq('campaign_id', rfp.campaign_id)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (backerError) {
    return NextResponse.json({ message: 'Could not verify campaign backing.' }, { status: 400 });
  }
  if (!backer) {
    return NextResponse.json(
      { message: 'Only campaign backers can raise a deliverable dispute.' },
      { status: 403 }
    );
  }

  const { data: existingDispute, error: disputeReadError } = await supabase
    .from('disputes')
    .select('id')
    .eq('deliverable_id', deliverableId)
    .eq('status', 'OPEN')
    .limit(1)
    .maybeSingle();

  if (disputeReadError) {
    return NextResponse.json({ message: 'Could not verify existing disputes.' }, { status: 400 });
  }
  if (existingDispute) {
    return NextResponse.json({ message: 'This deliverable already has an open dispute.' }, { status: 409 });
  }

  const { data: dispute, error: insertError } = await supabase
    .from('disputes')
    .insert({ deliverable_id: deliverableId, raised_by: user.id, reason, status: 'OPEN' })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ message: insertError.message }, { status: 400 });
  }

  const { error: deliverableUpdateError } = await supabase
    .from('deliverables')
    .update({ status: 'DISPUTED' })
    .eq('id', deliverableId);

  if (deliverableUpdateError) {
    return NextResponse.json({ message: 'Dispute saved, but the deliverable status could not be updated.' }, { status: 500 });
  }

  const { error: campaignUpdateError } = await supabase
    .from('campaigns')
    .update({ status: 'DISPUTED' })
    .eq('id', rfp.campaign_id);

  if (campaignUpdateError) {
    return NextResponse.json({ message: 'Dispute saved, but the campaign status could not be updated.' }, { status: 500 });
  }

  await supabase.rpc('log_audit', {
    p_event: 'DISPUTE_RAISED',
    p_entity_type: 'deliverable',
    p_entity_id: deliverableId,
    p_payload: { dispute_id: dispute.id },
  });

  return NextResponse.json({
    message: 'Dispute recorded and campaign frozen for review.',
    disputeId: dispute.id,
  });
}
