import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const amountCents = Math.round(amount * 100);
  const rfpId = typeof body.rfpId === 'string' ? body.rfpId : '';
  const proposal = typeof body.proposal === 'string' ? body.proposal.trim() : '';

  if (!rfpId || !Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ message: 'Enter a valid bid amount.' }, { status: 400 });
  }
  if (proposal.length < 20 || proposal.length > 5000) {
    return NextResponse.json(
      { message: 'Proposal must be between 20 and 5,000 characters.' },
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
    return NextResponse.json({ message: 'Sign in before submitting a bid.' }, { status: 401 });
  }

  const { data: rfp, error: rfpError } = await supabase
    .from('rfps')
    .select('id,budget_cents,status,campaigns(status)')
    .eq('id', rfpId)
    .maybeSingle();

  if (rfpError) {
    return NextResponse.json({ message: 'Could not verify this RFP.' }, { status: 400 });
  }
  if (!rfp) {
    return NextResponse.json({ message: 'RFP not found.' }, { status: 404 });
  }

  const campaign = Array.isArray(rfp.campaigns) ? rfp.campaigns[0] : rfp.campaigns;
  if (rfp.status !== 'OPEN' || campaign?.status !== 'RFP_OPEN') {
    return NextResponse.json({ message: 'This RFP is not accepting bids.' }, { status: 409 });
  }
  if (amountCents > Number(rfp.budget_cents || 0)) {
    return NextResponse.json({ message: 'Bid cannot exceed the RFP budget.' }, { status: 400 });
  }

  const { error: profileError } = await supabase
    .from('advocate_profiles')
    .upsert({
      id: user.id,
      firm_name: user.email,
      verification_status: 'pending',
    }, { onConflict: 'id', ignoreDuplicates: true });

  if (profileError) {
    return NextResponse.json({ message: profileError.message }, { status: 400 });
  }

  const { error } = await supabase.from('bids').insert({
    rfp_id: rfpId,
    advocate_id: user.id,
    amount_cents: amountCents,
    proposal,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ message: 'You have already submitted a bid for this RFP.' }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: 'Test bid submitted.' });
}
