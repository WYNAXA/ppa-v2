// ── notify-onesignal Edge Function ─────────────────────────────────────────
// Called by a Database Webhook on INSERT into the `notifications` table.
// Sends a OneSignal push to the recipient so iOS App Store users get native push
// for every in-app bell notification.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

  const appOrigin = 'https://app.padelplayersapp.com'
  const resolvedNavUrl = navUrl || '/notifications'
  const absoluteUrl = `${appOrigin}${resolvedNavUrl}`

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
        url: absoluteUrl,
        data: {
          ...(record?.id ? { notification_id: record.id } : {}),
          ...(record?.related_id ? { related_id: record.related_id } : {}),
          ...(record?.type ? { type: record.type } : {}),
          url: resolvedNavUrl,
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
