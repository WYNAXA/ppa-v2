import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Web Push crypto (RFC 8030 + VAPID) ──────────────────────────────────────
// Minimal implementation using Web Crypto API (Deno-native, no npm packages).

async function importVapidKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - str.length % 4) % 4)
  return Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

async function createJwtToken(audience: string, vapidPrivateKey: string, vapidPublicKey: string): Promise<string> {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: 'mailto:hello@padelplayersapp.com',
  })))

  const privKeyRaw = base64UrlDecode(vapidPrivateKey)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    await crypto.subtle.exportKey('pkcs8',
      await crypto.subtle.importKey('jwk', {
        kty: 'EC', crv: 'P-256',
        d: base64UrlEncode(privKeyRaw),
        x: base64UrlEncode(base64UrlDecode(vapidPublicKey).slice(1, 33)),
        y: base64UrlEncode(base64UrlDecode(vapidPublicKey).slice(33, 65)),
      }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
    ),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  )

  const signingInput = new TextEncoder().encode(`${header}.${payload}`)
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput))

  // Convert DER signature to raw r||s (64 bytes)
  const r = signature.slice(0, 32)
  const s = signature.slice(32, 64)
  const rawSig = new Uint8Array(64)
  rawSig.set(r)
  rawSig.set(s, 32)

  return `${header}.${payload}.${base64UrlEncode(rawSig)}`
}

async function sendPushToSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<{ success: boolean; status: number; gone?: boolean }> {
  try {
    const url = new URL(subscription.endpoint)
    const audience = `${url.protocol}//${url.host}`
    const jwt = await createJwtToken(audience, vapidPrivateKey, vapidPublicKey)

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        TTL: '86400',
      },
      body: new TextEncoder().encode(payload),
    })

    return {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      gone: response.status === 410,
    }
  } catch {
    return { success: false, status: 0 }
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

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

  // Fetch push tokens for all target users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', user_ids)
    .not('push_token', 'is', null)

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

      const result = await sendPushToSubscription(sub, payload, vapidPublicKey, vapidPrivateKey)

      if (result.gone) {
        // Subscription expired — clean up
        await supabase.from('profiles').update({ push_token: null }).eq('id', profile.id)
        failed++
      } else if (result.success) {
        sent++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: corsHeaders })
})
