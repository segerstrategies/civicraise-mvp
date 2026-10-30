import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const recipient = process.env.GUIDE_NOTES_RECIPIENT || 'william.lockhart@gmail.com';
const maxLength = 3000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Sign in to send notes and questions.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const type = body?.type === 'note' ? 'note' : body?.type === 'question' ? 'question' : null;
  const page = typeof body?.page === 'string' ? body.page.trim().slice(0, 120) : '';
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, maxLength) : '';
  const createdAt = typeof body?.createdAt === 'string' ? body.createdAt : new Date().toISOString();
  if (!type || !page || !text) return NextResponse.json({ message: 'A page and message are required.' }, { status: 400 });
  const key = process.env.RESEND_API_KEY;
  const from = process.env.GUIDE_NOTES_FROM;
  if (!key || !from) return NextResponse.json({ message: 'Email delivery is not configured.' }, { status: 503 });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [recipient], subject: `CivicRaise ${type} from ${user.email || user.id}`, text: `Type: ${type}\nFrom: ${user.email || user.id}\nPage: ${page}\nTime: ${createdAt}\n\n${text}` }),
  });
  if (!response.ok) return NextResponse.json({ message: 'CivicRaise could not send this email.' }, { status: 502 });
  return NextResponse.json({ message: `Sent to ${recipient}.` });
}
