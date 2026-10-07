import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/dashboard'
  if (!code) return NextResponse.redirect(new URL('/auth?error=missing_code', url.origin))

  const sb = await createClient()
  if (!sb) return NextResponse.redirect(new URL('/auth?error=not_configured', url.origin))
  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error.message)}`, url.origin))
  return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/dashboard', url.origin))
}
