import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Sign in required.' }, { status: 401 });
  }

  const { data: me } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (me?.role !== 'admin') {
    return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  }

  const { campaignId, status } = await req.json().catch(() => ({}));
  if (!campaignId || !status) {
    return NextResponse.json({ message: 'Campaign and status are required.' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('admin_advance_campaign', {
    p_campaign_id: campaignId,
    p_target_status: status,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (!data?.ok) {
    return NextResponse.json({ message: data?.message || 'Campaign transition was rejected.' }, { status: 409 });
  }

  return NextResponse.json({ message: data.message });
}
