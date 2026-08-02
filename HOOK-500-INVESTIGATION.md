# Send Email Hook 500 Investigation

**Date:** 2026-08-02
**Reporter:** Charlie Farrant (farrantcharlie@gmail.com)
**Error:** "Unexpected status code returned from hook 500" on Forgot Password
**Project:** timbjfihsxqfrqrxwdny (Padel Players App)

---

## 1. ROOT CAUSE

**UNDETERMINED** — but narrowed to two candidates with high confidence.

The Send Email hook is the Edge Function `send-auth-email` (v41, last deployed 2026-03-17).
I downloaded the full source from Supabase (it was never committed to this repo). The function
handles `recovery` correctly at the code level — so the 500 is not caused by an unhandled
`email_action_type`. The 500 is returned to GoTrue from one of exactly two code paths:

1. **[Likely] Resend API rejection** — Lines 134–140: if the Resend API returns a non-2xx
   response, the function returns 500. The most probable cause is that the sending domain
   `padelplayersapp.com` is no longer verified in Resend, or the RESEND_API_KEY has been
   rotated/revoked. The function sends `from: "noreply@padelplayersapp.com"` (line 128).
   If Resend cannot verify authority to send from that domain, it returns 403 → the function
   returns 500 → GoTrue surfaces the hook error.

2. **[Likely] Uncaught exception** — Lines 149–154: any exception in the try block produces
   a 500. A plausible trigger: if `JSON.parse(bodyText)` fails (line 42) because GoTrue sends
   the Standard Webhooks envelope format and the function doesn't unwrap it correctly.

**Why I cannot determine which:** The CLI version installed (v2.78.1) does not support
`supabase functions logs`. The function has no external logging (no Sentry, no external log
drain). The Resend dashboard and Supabase Auth Hooks logs in the dashboard are required to
distinguish between these two candidates.

**Critical context:** `enable_confirmations = false` in config.toml (line 209), which means
signup never triggers the Send Email hook. [Certain] This hook may have been silently broken
for weeks/months — password reset is likely the first flow that actually exercises it.

---

## 2. AFFECTED FLOWS

| email_action_type     | Affected? | User journey impact |
|----------------------|-----------|---------------------|
| `recovery`           | **YES**   | Forgot Password is completely broken. Users cannot reset passwords. [Certain — reported] |
| `signup` / `email_confirmation` | **NO** — `enable_confirmations = false` means GoTrue never fires the hook for signups. [Certain — config.toml:209] |
| `invite`             | **YES** — if admin invites are used, they would hit the same function. The function does NOT handle `invite` — it falls through to the `else` branch (line 112-118) which returns 200 with "Email type not handled". So invites silently succeed (no error) but NO email is sent. [Certain — code] |
| `magiclink`          | **YES** — same as invite: unhandled, returns 200, no email sent. Silent failure. [Certain — code] |
| `email_change`       | **YES** — same: unhandled, returns 200, no email sent. `double_confirm_changes = true` (config.toml:207) means email-change requires confirmation, which would never arrive. [Certain — code] |

**Severity:** Password reset is the immediate user-facing break. But invite, magic link,
and email change are also silently broken (they return 200 to GoTrue so no error surfaces,
but no email is ever sent).

---

## 3. EVIDENCE

### 3a. The hook function: `send-auth-email/index.ts` (downloaded from Supabase, not in repo)

```typescript
// Line 1 — old Deno serve API (still functional; poll-scheduler uses same pattern)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Lines 3-4 — env vars read at module level
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

// Lines 12-33 — signature verification function DEFINED but NEVER CALLED
async function verifyHookSignature(req: Request, body: string): Promise<boolean> {
  try {
    if (!HOOK_SECRET) return true;  // Line 14: silently skips if secret missing
    // ... HMAC verification logic ...
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

// Line 35 — handler begins; note: verifyHookSignature is never invoked
serve(async (req) => {
  // ...

  // Lines 62-118 — email_action_type branching
  if (emailType === "signup" || emailType === "email_confirmation") {
    // ... signup template ...
  } else if (emailType === "recovery") {
    // Lines 87-111 — recovery template (EXISTS AND IS CORRECT)
    const resetUrl = `${siteUrl}/verify?token=${tokenHash}&type=recovery&...`;
    subject = "Reset your Padel Players App password";
    html = `...`;
  } else {
    // Lines 112-118 — unhandled types: returns 200, NO email sent
    console.log("Unhandled email type:", emailType);
    return new Response(JSON.stringify({ message: "Email type not handled" }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Lines 120-131 — Resend API call
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,  // Line 123
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@padelplayersapp.com",  // Line 128 — requires domain verification in Resend
      to: toEmail,
      subject,
      html,
    }),
  });

  // Lines 134-140 — Resend failure → 500 returned to GoTrue
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: err }), {
      status: 500,      // ← THIS is what GoTrue sees
      headers: corsHeaders,
    });
  }

  // Line 144 — success response
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // Lines 149-154 — catch-all: also returns 500
  } catch (err) {
    console.error("Hook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
```

### 3b. Client-side trigger: `src/pages/Auth.tsx`

```typescript
// Line 230 — standard Supabase client call, triggers GoTrue → Send Email hook
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/reset`,
})
// Line 234 — error.message surfaces the GoTrue hook error to the user
if (error) {
  setMessage({ type: 'error', text: error.message })
}
```

### 3c. Config: `supabase/config.toml`

- Line 209: `enable_confirmations = false` — signup never triggers hook
- Line 207: `double_confirm_changes = true` — email change DOES need hook
- No `[auth.hook.send_email]` block — hook is configured in dashboard only [Certain]

### 3d. Secrets (confirmed present via `supabase secrets list`)

Both `RESEND_API_KEY` and `SEND_EMAIL_HOOK_SECRET` exist as Edge Function secrets. [Certain]

### 3e. Deployment info

`send-auth-email`: version 41, last updated 2026-03-17 12:16:57 UTC. [Certain]
Never committed to this git repo. [Certain]

---

## 4. PROPOSED FIX

**This is a two-part fix: immediate (root-cause) + durable (root-cause + silent failures).**

### Immediate: Diagnose and fix the Resend API failure

1. Check Resend dashboard → Domains: is `padelplayersapp.com` verified? Check DNS records
   (SPF, DKIM, DMARC). If verification lapsed, re-verify.
2. Check Resend dashboard → API Keys: is the key matching `RESEND_API_KEY` active?
3. Check Supabase dashboard → Edge Function logs for `send-auth-email`: the `console.error`
   on line 136 or 150 will show the exact Resend error or exception.
4. If the Resend API key or domain is the issue, fix it and test with a manual password reset.

**Classification: (a) root-cause fix.** The 500 is caused by a downstream API failure; fixing
the API configuration addresses the actual cause, not a symptom.

### Durable: Fix the function properly

The function has several issues beyond the immediate 500:

1. **Webhook signature verification is dead code** (line 12-33 defined, never called). The
   function accepts ANY request without verifying it came from GoTrue. This should be fixed
   by actually calling `verifyHookSignature` in the handler.

2. **Unhandled email types silently succeed** (lines 112-118). `invite`, `magiclink`, and
   `email_change` return 200 but send no email. These need templates or should return an
   error so the failure is visible.

3. **The function is not in version control.** It was deployed directly to Supabase and exists
   only in the cloud. It should be committed to `supabase/functions/send-auth-email/index.ts`
   and deployed via CI.

4. **No structured error logging.** The `console.error` calls write to Supabase function logs
   but there is no Sentry, no alert, no way to know it's failing without a user complaint.

**Classification: (a) root-cause for items 1-2, (c) cosmetic for item 3-4 (but critical for
operational reliability).**

---

## 5. WHAT I COULD NOT SEE

Christian needs to check the following in the Supabase and Resend dashboards:

- [ ] **Supabase Dashboard → Authentication → Hooks → Send Email**: Confirm the hook is
  enabled and the URI points to `send-auth-email`. Note whether JWT verification is on or off
  for this function — it MUST be off (`--no-verify-jwt`) since GoTrue sends a webhook
  signature, not a JWT.
- [ ] **Supabase Dashboard → Edge Functions → send-auth-email → Logs**: Check the last ~50
  log entries. Look for `console.error("Resend error:", ...)` or
  `console.error("Hook error:", ...)` — these will reveal the exact failure.
- [ ] **Resend Dashboard → Domains**: Is `padelplayersapp.com` verified? Are DNS records
  (DKIM, SPF) still valid? Has verification expired?
- [ ] **Resend Dashboard → API Keys**: Is the API key active? Has it been rotated?
- [ ] **Resend Dashboard → Emails (Logs)**: Filter by `noreply@padelplayersapp.com` and check
  recent delivery status. Are any emails getting through from this function?
- [ ] **Resend Dashboard → Emails (Logs)**: Check for 403/401/422 responses from Resend for
  the `send-auth-email` function's requests.
- [ ] **Test manually**: Trigger a password reset for a test account and watch the Edge
  Function logs in real time.
- [ ] **Check if `send-password-reset` function works**: This separate function
  (v44, updated 2026-03-16) also uses Resend with the same API key but calls
  `auth.admin.generateLink()` and sends the email directly. If it works, the Resend key is
  valid and the issue is specific to `send-auth-email` (possibly JWT verification blocking
  GoTrue's request).

---

## 6. MISSING SAFETY NET

This failure went undetected from an unknown start date until 2026-08-02 when a user
(Charlie Farrant) complained. The following monitoring is absent:

**No hook health monitoring.** Supabase does not natively alert on auth hook failures.
GoTrue logs the error but there is no alerting pipeline. A synthetic monitor should
periodically trigger `resetPasswordForEmail` for a canary account and alert if the response
contains an error.

**No Edge Function error alerting.** The `send-auth-email` function logs errors via
`console.error` but these go to Supabase's built-in log viewer, which nobody checks
proactively. The function should report errors to Sentry (as other functions in this project
do via `sentry-init.ts`) or to an external log aggregator with alerting.

**No Resend delivery monitoring.** There is no check on Resend's delivery status or bounce
rate. A Resend webhook for delivery failures → Slack/email alert would surface domain
verification lapses or API key issues immediately.

**No end-to-end auth flow testing.** There are no automated tests that exercise the full
password reset flow (trigger reset → check email delivery → follow link). A weekly synthetic
test covering signup confirmation, password reset, and invite would catch hook breakage
within hours, not weeks.

**Silent success on unhandled types.** The function returns 200 for unhandled email types
(invite, magiclink, email_change), meaning GoTrue considers the email "sent" when it was
silently dropped. This masks failures for those flows entirely — they will never surface
as errors, only as user complaints ("I never got the invite email").
