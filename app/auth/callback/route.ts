import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const requestedNext = url.searchParams.get('next')
  if (!code) return NextResponse.redirect(new URL('/auth?error=missing_code', url.origin))

  const sb = await createClient()
  if (!sb) return NextResponse.redirect(new URL('/auth?error=not_configured', url.origin))
  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error.message)}`, url.origin))
  const safeRequestedNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')
    ? requestedNext
    : null
  let next = safeRequestedNext || '/dashboard'

  if (!safeRequestedNext) {
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: profile } = await sb
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', user.id)
        .maybeSingle()
      if (!profile?.onboarding_completed_at) next = '/onboarding'
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
