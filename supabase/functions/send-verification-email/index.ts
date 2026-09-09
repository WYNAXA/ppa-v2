// send-verification-email Edge Function
// Sends a 6-digit verification code to a claimed email address.
// Called by the client after claim_venue inserts a pending venue_users row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return new Response(
      JSON.stringify({ error: 'Email service not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Authenticate the caller
  const authHeader = req.headers.get('authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let body: { venue_id: string; email: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { venue_id, email } = body
  if (!venue_id || !email) {
    return new Response(
      JSON.stringify({ error: 'venue_id and email are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Server-side domain validation: check email domain matches venue website domain
  const { data: venue } = await supabase
    .from('padel_venues')
    .select('venue_name, website')
    .eq('venue_id', venue_id)
    .maybeSingle()

  if (!venue) {
    return new Response(
      JSON.stringify({ error: 'Venue not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Extract domain from venue website and validate email matches
  const venueDomain = extractDomain(venue.website ?? '')
  const emailDomain = email.split('@')[1]?.toLowerCase()

  if (!venueDomain || !emailDomain || emailDomain !== venueDomain) {
    return new Response(
      JSON.stringify({ error: 'Email domain does not match venue website domain' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

  // Invalidate any existing unused tokens for this user+venue
  await supabase
    .from('venue_claim_verifications')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('venue_id', venue_id)
    .is('used_at', null)

  // Insert verification token
  const { error: insertErr } = await supabase
    .from('venue_claim_verifications')
    .insert({
      venue_id,
      user_id: user.id,
      email: email.toLowerCase(),
      token: code,
      expires_at: expiresAt,
    })

  if (insertErr) {
    return new Response(
      JSON.stringify({ error: 'Failed to create verification token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Send email via Resend
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'WYNAXA <noreply@wynaxa.com>',
      to: [email],
      subject: `Your venue verification code: ${code}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #111; margin-bottom: 8px;">Verify your venue claim</h2>
          <p style="color: #555; font-size: 14px; line-height: 1.5;">
            You're claiming <strong>${venue.venue_name}</strong> on WYNAXA Venue Manager.
            Enter this code to verify you have access to this venue's email:
          </p>
          <div style="background: #f0fdf4; border: 2px solid #009688; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #009688;">${code}</span>
          </div>
          <p style="color: #888; font-size: 12px;">This code expires in 24 hours. If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text()
    console.error('[send-verification-email] Resend error:', errText)
    return new Response(
      JSON.stringify({ error: 'Failed to send verification email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

function extractDomain(url: string): string | null {
  if (!url) return null
  try {
    const cleaned = url.match(/^https?:\/\//) ? url : `https://${url}`
    const hostname = new URL(cleaned).hostname.toLowerCase()
    // Strip www. prefix
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
