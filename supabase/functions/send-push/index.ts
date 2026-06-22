// ── send-push Edge Function ────────────────────────────────────────────────
// Sends Web Push notifications to users via the web-push library.
//
// Required Supabase secrets:
//   VAPID_PUBLIC_KEY   — base64url-encoded ECDSA P-256 public key
//   VAPID_PRIVATE_KEY  — base64url-encoded ECDSA P-256 private key
//
// Generate keys with: npx web-push generate-vapid-keys
// Set them with:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500, headers: corsHeaders,
    })
  }

  webpush.setVapidDetails(
    'mailto:hello@padelplayersapp.com',
    vapidPublicKey,
    vapidPrivateKey,
  )

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
  }

  const { user_ids, title, message, url, tag } = body
  if (!user_ids?.length || !title) {
    return new Response(JSON.stringify({ error: 'user_ids and title required' }), {
      status: 400, headers: corsHeaders,
    })
  }

  // Fetch push tokens for all target users who haven't opted out
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', user_ids)
    .not('push_token', 'is', null)
    .neq('push_opted_out', true)

  if (!profiles?.length) {
    return new Response(JSON.stringify({ sent: 0, message: 'No push subscriptions found' }), {
      headers: corsHeaders,
    })
  }

  const payload = JSON.stringify({ title, message, url, tag })
  let sent = 0
  let failed = 0

  for (const profile of profiles) {
    try {
      const sub = JSON.parse(profile.push_token)
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        failed++
        continue
      }

      await webpush.sendNotification(sub, payload)
      sent++
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        // Subscription expired or invalid — clean up
        await supabase.from('profiles').update({ push_token: null }).eq('id', profile.id)
      }
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: corsHeaders })
})
