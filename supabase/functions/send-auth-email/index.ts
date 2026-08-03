import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function maskEmail(email: string | undefined): string {
  if (!email || !email.includes("@")) return "[no-email]";
  const [local, domain] = email.split("@");
  return `${local[0]}***@${domain}`;
}

function safeLogContext(payload: Record<string, unknown>) {
  const user = payload.user as Record<string, unknown> | undefined;
  const emailData = payload.email_data as Record<string, unknown> | undefined;
  return {
    email_action_type: emailData?.email_action_type ?? "unknown",
    user_id: user?.id ?? "unknown",
    user_email: maskEmail(user?.email as string | undefined),
  };
}

function getWebhook(): Webhook {
  if (!HOOK_SECRET) {
    throw new Error("SEND_EMAIL_HOOK_SECRET is not set — failing closed");
  }
  // Supabase stores the secret as "v1,whsec_<base64>". The standardwebhooks
  // library expects "whsec_<base64>" (it strips its own prefix internally).
  const secret = HOOK_SECRET.startsWith("v1,")
    ? HOOK_SECRET.slice("v1,".length)
    : HOOK_SECRET;
  return new Webhook(secret);
}

// ── Brand constants ────────────────────────────────────────────────────────

const BRAND = {
  teal: "#0D9488",
  tealHover: "#009688",
  gray600: "#6B7280",
  gray400: "#9CA3AF",
  dark: "#111827",
  bgLight: "#F0FDFA",
} as const;

function emailShell(innerHtml: string): string {
  return `<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#fff">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="color:${BRAND.teal};font-size:28px;font-weight:700;margin:0">Padel Players App</h1>
    <p style="color:${BRAND.gray600};font-size:14px;margin:4px 0 0">Your padel community</p>
  </div>
  <div style="background:${BRAND.bgLight};border-radius:16px;padding:32px;margin-bottom:24px">
    ${innerHtml}
  </div>
  <div style="text-align:center;color:${BRAND.gray400};font-size:13px">
    <p style="margin:0">Padel Players App — BS3 Padel</p>
    <p style="margin:4px 0 0"><a href="https://padelplayersapp.com" style="color:${BRAND.teal}">padelplayersapp.com</a></p>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0">
  <a href="${href}" style="background:${BRAND.teal};color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block">${label}</a>
</div>`;
}

// ── Email templates ────────────────────────────────────────────────────────

interface EmailParts { subject: string; html: string }

function buildEmail(
  emailType: string,
  user: Record<string, unknown>,
  emailData: Record<string, unknown>,
): EmailParts | null {
  const tokenHash = emailData.token_hash as string | undefined;
  const siteUrl = (emailData.site_url as string) || "https://timbjfihsxqfrqrxwdny.supabase.co/auth/v1";
  const redirectTo = (emailData.redirect_to as string) || "https://padelplayersapp.com/home";
  const userName = (user.user_metadata as Record<string, unknown>)?.name as string | undefined;

  switch (emailType) {
    case "signup":
    case "email_confirmation": {
      const confirmUrl = `${siteUrl}/verify?token=${tokenHash}&type=signup&redirect_to=${encodeURIComponent(redirectTo)}`;
      return {
        subject: "Welcome to Padel Players App — confirm your email",
        html: emailShell(`
          <h2 style="color:${BRAND.dark};font-size:20px;margin-top:0">Welcome${userName ? ", " + userName : ""}! 🎾</h2>
          <p style="color:${BRAND.gray600};font-size:15px;line-height:1.6">You're almost in. Click below to confirm your email and start playing.</p>
          ${ctaButton(confirmUrl, "Confirm My Email")}
          <p style="color:${BRAND.gray400};font-size:13px;text-align:center;margin:0">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
        `),
      };
    }

    case "recovery": {
      const resetUrl = `${siteUrl}/verify?token=${tokenHash}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`;
      return {
        subject: "Reset your Padel Players App password",
        html: emailShell(`
          <h2 style="color:${BRAND.dark};font-size:20px;margin-top:0">Reset your password</h2>
          <p style="color:${BRAND.gray600};font-size:15px;line-height:1.6">We received a request to reset your password. Click below to set a new one.</p>
          ${ctaButton(resetUrl, "Reset My Password")}
          <p style="color:${BRAND.gray400};font-size:13px;text-align:center;margin:0">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        `),
      };
    }

    case "invite": {
      const inviteUrl = `${siteUrl}/verify?token=${tokenHash}&type=invite&redirect_to=${encodeURIComponent(redirectTo)}`;
      return {
        subject: "You've been invited to Padel Players App",
        html: emailShell(`
          <h2 style="color:${BRAND.dark};font-size:20px;margin-top:0">You're invited! 🎾</h2>
          <p style="color:${BRAND.gray600};font-size:15px;line-height:1.6">Someone has invited you to join Padel Players App. Click below to accept and set up your account.</p>
          ${ctaButton(inviteUrl, "Accept Invite")}
          <p style="color:${BRAND.gray400};font-size:13px;text-align:center;margin:0">This link expires in 24 hours. If you weren't expecting this, ignore this email.</p>
        `),
      };
    }

    case "magiclink": {
      const magicUrl = `${siteUrl}/verify?token=${tokenHash}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;
      return {
        subject: "Your Padel Players App sign-in link",
        html: emailShell(`
          <h2 style="color:${BRAND.dark};font-size:20px;margin-top:0">Sign in to Padel Players App</h2>
          <p style="color:${BRAND.gray600};font-size:15px;line-height:1.6">Click the button below to sign in. No password needed.</p>
          ${ctaButton(magicUrl, "Sign In")}
          <p style="color:${BRAND.gray400};font-size:13px;text-align:center;margin:0">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        `),
      };
    }

    case "email_change": {
      const confirmUrl = `${siteUrl}/verify?token=${tokenHash}&type=email_change&redirect_to=${encodeURIComponent(redirectTo)}`;
      return {
        subject: "Confirm your new email — Padel Players App",
        html: emailShell(`
          <h2 style="color:${BRAND.dark};font-size:20px;margin-top:0">Confirm your new email</h2>
          <p style="color:${BRAND.gray600};font-size:15px;line-height:1.6">You requested to change your email address. Click below to confirm this change.</p>
          ${ctaButton(confirmUrl, "Confirm Email Change")}
          <p style="color:${BRAND.gray400};font-size:13px;text-align:center;margin:0">If you didn't request this change, ignore this email — your account is safe.</p>
        `),
      };
    }

    default:
      return null;
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify Standard Webhooks signature BEFORE any processing.
  // Uses webhook-id, webhook-timestamp, webhook-signature headers per spec.
  // Fails closed if secret is missing or signature is invalid.
  const bodyText = await req.text();
  let payload: Record<string, unknown>;

  try {
    const wh = getWebhook();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    payload = wh.verify(bodyText, headers) as Record<string, unknown>;
  } catch (e) {
    console.error("Webhook verification failed:", (e as Error).message);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  try {

    // Defect 2 fix: log only safe context — never tokens, token_hash, or full payload
    const logCtx = safeLogContext(payload);
    console.log("Auth email hook invoked:", JSON.stringify(logCtx));

    const { user, email_data: emailData } = payload;
    const emailType = emailData?.email_action_type;
    const toEmail = user?.email;

    if (!toEmail) {
      console.error("No recipient email in payload", JSON.stringify(logCtx));
      return new Response(JSON.stringify({ error: "No email address" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Defect 3 fix: build email for all five known types; reject unknown types with 500
    const email = buildEmail(emailType, user, emailData);
    if (!email) {
      console.error(`Unhandled email_action_type: "${emailType}"`, JSON.stringify(logCtx));
      return new Response(
        JSON.stringify({ error: `Unhandled email type: ${emailType}` }),
        { status: 500, headers: corsHeaders },
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@padelplayersapp.com",
        to: toEmail,
        subject: email.subject,
        html: email.html,
      }),
    });

    // Defect 4 fix: log provider error details (no tokens) and return non-2xx to GoTrue
    if (!res.ok) {
      const errBody = await res.text();
      console.error(
        `Resend API error: status=${res.status}`,
        errBody,
        JSON.stringify(logCtx),
      );
      return new Response(JSON.stringify({ error: "Email provider error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    // Defect 2: catch block also uses safe logging — no raw payload
    console.error("Hook error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal hook error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
