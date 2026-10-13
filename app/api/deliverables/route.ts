import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const contractId = typeof body?.contractId === 'string' ? body.contractId : '';
  const milestoneId = typeof body?.milestoneId === 'string' ? body.milestoneId : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';

  if (!contractId || !milestoneId || description.length < 20 || description.length > 5000) {
    return NextResponse.json(
      { message: 'Contract, milestone, and a 20–5,000 character description are required.' },
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

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('*,rfps(campaign_id,status)')
    .eq('id', contractId)
    .eq('advocate_id', user.id)
    .maybeSingle();

  if (contractError) {
    return NextResponse.json({ message: 'Could not verify this contract.' }, { status: 400 });
  }
  if (!contract) {
    return NextResponse.json({ message: 'Contract not found for this advocate.' }, { status: 403 });
  }
  if (!['ACTIVE', 'IN_PROGRESS'].includes(contract.status)) {
    return NextResponse.json({ message: 'Contract is not accepting deliverables.' }, { status: 409 });
  }

  const campaignId = (contract.rfps as any)?.campaign_id;
  if (!campaignId) {
    return NextResponse.json({ message: 'Contract campaign could not be resolved.' }, { status: 400 });
  }

  const { data: milestone, error: milestoneError } = await supabase
    .from('campaign_milestones')
    .select('id')
    .eq('id', milestoneId)
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (milestoneError) {
    return NextResponse.json({ message: 'Could not verify this milestone.' }, { status: 400 });
  }
  if (!milestone) {
    return NextResponse.json({ message: 'Milestone does not belong to this campaign.' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('deliverables')
    .select('id')
    .eq('contract_id', contractId)
    .eq('milestone_id', milestoneId)
    .in('status', ['SUBMITTED', 'ACCEPTED'])
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ message: 'Could not verify existing deliverables.' }, { status: 400 });
  }
  if (existing) {
    return NextResponse.json({ message: 'A deliverable already exists for this milestone.' }, { status: 409 });
  }

  const { data: deliverable, error: insertError } = await supabase
    .from('deliverables')
    .insert({
      contract_id: contractId,
      milestone_id: milestoneId,
      description,
      status: 'SUBMITTED',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ message: insertError.message }, { status: 400 });
  }

  await supabase.from('campaigns').update({ status: 'BACKER_REVIEW' }).eq('id', campaignId);
  const { data: ballot } = await supabase
    .from('ratification_ballots')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (!ballot) {
    await supabase.from('ratification_ballots').insert({
      campaign_id: campaignId,
      deliverable_id: deliverable.id,
      status: 'OPEN',
      quorum_percent: 60,
      approval_percent: 85,
    });
  }

  await supabase.rpc('log_audit', {
    p_event: 'DELIVERABLE_SUBMITTED',
    p_entity_type: 'deliverable',
    p_entity_id: deliverable.id,
    p_payload: { contract_id: contractId, milestone_id: milestoneId },
  });

  return NextResponse.json({
    message: 'Deliverable submitted and backer review opened.',
    deliverableId: deliverable.id,
  });
}
