// ── ops-alert Edge Function ─────────────────────────────────────────────────
// Deploy: supabase functions deploy ops-alert --no-verify-jwt
// Guarded by the x-webhook-secret header (Vault secret 'ops_alert_secret').
//
// Internal operational alerting ONLY. Emails platform admins via Resend.
//
// WHY EMAIL AND NOT THE APP'S OWN NOTIFICATIONS:
//   On 2026-09-09 the push pipeline was found dead for four weeks. A monitor
//   that reports through the product's notification channel cannot tell you
//   that the product's notification channel is down — it is circular, and it
//   would have been silent about the exact outage it exists to catch.
//   It also means operational text can never reach a player's phone: an earlier
//   revision of this monitor pushed "Scheduled job failing" to admin accounts
//   on the same channel players receive "How did your match go?".
//
//   Recipients are passed in by the caller (check_cron_health already knows
//   them) so this function needs no database access at all.
// ────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const OPS_ALERT_SECRET = Deno.env.get('OPS_ALERT_SECRET')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // verify_jwt is disabled at the gateway, so this check is the only thing
  // between the public internet and your inbox. Fails closed.
  if (req.headers.get('x-webhook-secret') !== OPS_ALERT_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  if (!RESEND_API_KEY) {
    console.error('[ops-alert] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'Mailer not configured' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  let payload: { subject?: string; body?: string; recipients?: string[] }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  const { subject, body, recipients } = payload

  if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0) {
    return new Response(
      JSON.stringify({ error: 'subject, body and non-empty recipients[] required' }),
      { status: 400, headers: corsHeaders },
    )
  }

  const html = `<html>
<body style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;max-width:640px;margin:0 auto;padding:32px 20px;background:#fff">
  <div style="border-left:3px solid #B45309;padding-left:16px;margin-bottom:24px">
    <p style="color:#B45309;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px">Padel Players App &mdash; Operations</p>
    <h1 style="color:#111827;font-size:18px;margin:0">${escapeHtml(subject)}</h1>
  </div>
  <pre style="color:#374151;font-size:13px;line-height:1.7;white-space:pre-wrap;margin:0">${escapeHtml(body)}</pre>
  <p style="color:#9CA3AF;font-size:12px;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:16px">
    Automated operational alert. Not sent to players.
  </p>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ops@padelplayersapp.com',
        to: recipients,
        subject: `[PPA Ops] ${subject}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[ops-alert] resend failed status=${res.status} body=${err}`)
      return new Response(JSON.stringify({ error: err }), {
        status: 502,
        headers: corsHeaders,
      })
    }

    console.log(`[ops-alert] sent "${subject}" to ${recipients.length} recipient(s)`)
    return new Response(JSON.stringify({ sent: recipients.length }), {
      headers: corsHeaders,
    })
  } catch (e) {
    console.error('[ops-alert] error', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
