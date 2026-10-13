import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const minimumPledgeCents = 99;
const maximumPledgeCents = 1_000_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  const amountCents = Math.round(amount * 100);
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';

  if (!campaignId || !Number.isFinite(amount) || amountCents < minimumPledgeCents || amountCents > maximumPledgeCents) {
    return NextResponse.json(
      { message: 'Choose a test pledge amount between $0.99 and $10,000.' },
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
    return NextResponse.json({ message: 'Sign in before making a pledge.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('record_test_pledge', {
    p_campaign_id: campaignId,
    p_user_id: user.id,
    p_amount_cents: amountCents,
    p_reference: 'TEST-' + Date.now(),
  });

  if (error) {
    const status = error.message.includes('not accepting pledges') ? 409 : 400;
    return NextResponse.json({ message: error.message }, { status });
  }

  return NextResponse.json({
    message: 'Pledge of $' + (amountCents / 100).toFixed(2) + ' recorded.',
    campaign: data,
  });
}
