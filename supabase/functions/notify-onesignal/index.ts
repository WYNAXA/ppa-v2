// ── notify-onesignal Edge Function ─────────────────────────────────────────
// Deploy: supabase functions deploy notify-onesignal --no-verify-jwt
// Guarded by the x-webhook-secret header (Vault secret 'onesignal_webhook_secret',
// sent by the dispatch_notification_to_onesignal trigger).
// Called by the dispatch_notification_to_onesignal trigger on INSERT into `notifications`.
// Sends a OneSignal push to the recipient so iOS App Store users get native push
// for every in-app bell notification.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Invoked by the database trigger dispatch_notification_to_onesignal, which
  // sends a shared secret held in Vault. verify_jwt is disabled at the gateway
  // because legacy service_role JWTs are no longer accepted by Supabase, so
  // THIS CHECK is the only thing preventing arbitrary push sends.
  // Fails closed: a missing env var or missing header returns 401.
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('ONESIGNAL_WEBHOOK_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')
  const appId = Deno.env.get('ONESIGNAL_APP_ID')

  if (!key || !appId) {
    console.error('[notify-onesignal] ONESIGNAL_REST_API_KEY or ONESIGNAL_APP_ID not set')
    return new Response(JSON.stringify({ error: 'OneSignal not configured' }), { status: 200, headers: corsHeaders })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    console.error('[notify-onesignal] invalid JSON body')
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 200, headers: corsHeaders })
  }

  // Database Webhook payload: { type, table, record, old_record, schema }
  if (payload?.type !== 'INSERT' || payload?.table !== 'notifications') {
    console.log(`[notify-onesignal] skipping event: type=${payload?.type}, table=${payload?.table}`)
    return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: corsHeaders })
  }

  const record = payload.record
  const userId = record?.user_id as string | undefined
  const title = record?.title as string | undefined
  const body = record?.message as string | undefined
  const navUrl = record?.nav_url as string | undefined

  if (!userId) {
    console.log('[notify-onesignal] no user_id in record, skipping')
    return new Response(JSON.stringify({ skipped: true, reason: 'no user_id' }), { status: 200, headers: corsHeaders })
  }

  if (!title && !body) {
    console.log(`[notify-onesignal] no title or message for notification ${record?.id}, skipping`)
    return new Response(JSON.stringify({ skipped: true, reason: 'no title or message' }), { status: 200, headers: corsHeaders })
  }

  // Does this player want this kind of push? `wants_push` is the single gate:
  // it combines the master switch (profiles.push_opted_out) with the matching
  // notification_preferences category, so the two cannot be checked in one
  // place and skipped in another. Absent rows mean yes.
  //
  // This is the ONLY push path. There used to be a second trigger
  // (trg_dispatch_push -> send-push) that never fired because its GUC was
  // unset; it was dropped in 20260910000008 rather than taught the same rule
  // twice.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: wantsPush, error: wantsPushError } = await supabase
    .rpc('wants_push', { p_user_id: userId, p_type: record?.type ?? null })

  if (wantsPushError) {
    // Fail open. A push the player did not want is recoverable; a lookup
    // failure that silently swallows every notification is not.
    console.error(`[notify-onesignal] wants_push failed for user=${userId}, sending anyway`, wantsPushError)
  } else if (wantsPush === false) {
    console.log(`[notify-onesignal] user ${userId} has ${record?.type ?? 'this type'} muted, skipping`)
    return new Response(JSON.stringify({ skipped: true, reason: 'muted' }), { status: 200, headers: corsHeaders })
  }

  const resolvedNavUrl = navUrl || '/notifications'

  try {
    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [userId] },
        headings: { en: title ?? 'Padel Players' },
        contents: { en: body ?? '' },
        // No top-level `url` — that is a Launch URL that OneSignal iOS auto-opens
        // in Safari. Pass the destination only as data.nav_url so the app handles
        // routing internally on both iOS and Android.
        data: {
          ...(record?.id ? { notification_id: record.id } : {}),
          ...(record?.related_id ? { related_id: record.related_id } : {}),
          ...(record?.type ? { type: record.type } : {}),
          nav_url: resolvedNavUrl,
        },
      }),
    })

    if (res.ok) {
      const json = await res.json()
      console.log(`[notify-onesignal] sent to user=${userId}, status=${res.status}, id=${json.id ?? 'unknown'}, type=${record?.type ?? '-'}`)
    } else {
      console.error(`[notify-onesignal] failed for user=${userId}, status=${res.status}, body=${await res.text()}`)
    }
  } catch (e) {
    console.error(`[notify-onesignal] error for user=${userId}`, e)
  }

  // Always return 200 so webhook never blocks the database insert
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
})
