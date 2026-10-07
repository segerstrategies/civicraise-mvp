import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
export async function GET() {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ ok: false, database: 'not-configured' }, { status: 503 });
  const { error } = await sb.from('campaigns').select('id').limit(1);
  return NextResponse.json({ ok: !error, database: error ? 'error' : 'connected', environment: 'test-money-only' }, { status: error ? 503 : 200 });
}
