import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function verifyHookSignature(req: Request, body: string): Promise<boolean> {
  try {
    if (!HOOK_SECRET) return true;
    const secret = HOOK_SECRET.startsWith("v1,whsec_")
      ? HOOK_SECRET.slice("v1,whsec_".length)
      : HOOK_SECRET;
    const signature = req.headers.get("x-supabase-signature") ||
                      req.headers.get("authorization")?.replace("Bearer ", "") || "";
    if (!signature) return false;
    const encoder = new TextEncoder();
    const keyData = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = Uint8Array.from(atob(signature.replace("v1=", "")), c => c.charCodeAt(0));
    const bodyBytes = encoder.encode(body);
    return await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, bodyBytes);
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    console.log("Auth email hook payload:", JSON.stringify(payload));

    const { user, email_data } = payload;
    const emailType = email_data?.email_action_type;
    const toEmail = user?.email;
    const tokenHash = email_data?.token_hash;
    const siteUrl = email_data?.site_url || "https://timbjfihsxqfrqrxwdny.supabase.co/auth/v1";
    const redirectTo = email_data?.redirect_to || "https://padelplayersapp.com/home";

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "No email address" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    let subject = "";
    let html = "";

    if (emailType === "signup" || emailType === "email_confirmation") {
      const confirmUrl = `${siteUrl}/verify?token=${tokenHash}&type=signup&redirect_to=${encodeURIComponent(redirectTo)}`;
      subject = "Welcome to Padel Players App — confirm your email";
      html = `
        <html>
        <body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#fff">
          <div style="text-align:center;margin-bottom:32px">
            <h1 style="color:#0D9488;font-size:28px;font-weight:700;margin:0">Padel Players App</h1>
            <p style="color:#6B7280;font-size:14px;margin:4px 0 0">Your padel community</p>
          </div>
          <div style="background:#F0FDFA;border-radius:16px;padding:32px;margin-bottom:24px">
            <h2 style="color:#111827;font-size:20px;margin-top:0">Welcome${user?.user_metadata?.name ? ', ' + user.user_metadata.name : ''}! 🎾</h2>
            <p style="color:#6B7280;font-size:15px;line-height:1.6">You're almost in. Click below to confirm your email and start playing.</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${confirmUrl}" style="background:#0D9488;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block">Confirm My Email</a>
            </div>
            <p style="color:#9CA3AF;font-size:13px;text-align:center;margin:0">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
          </div>
          <div style="text-align:center;color:#9CA3AF;font-size:13px">
            <p style="margin:0">Padel Players App — BS3 Padel</p>
            <p style="margin:4px 0 0"><a href="https://padelplayersapp.com" style="color:#0D9488">padelplayersapp.com</a></p>
          </div>
        </body>
        </html>
      `;
    } else if (emailType === "recovery") {
      const resetUrl = `${siteUrl}/verify?token=${tokenHash}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`;
      subject = "Reset your Padel Players App password";
      html = `
        <html>
        <body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#fff">
          <div style="text-align:center;margin-bottom:32px">
            <h1 style="color:#0D9488;font-size:28px;font-weight:700;margin:0">Padel Players App</h1>
            <p style="color:#6B7280;font-size:14px;margin:4px 0 0">Your padel community</p>
          </div>
          <div style="background:#F0FDFA;border-radius:16px;padding:32px;margin-bottom:24px">
            <h2 style="color:#111827;font-size:20px;margin-top:0">Reset your password</h2>
            <p style="color:#6B7280;font-size:15px;line-height:1.6">We received a request to reset your password. Click below to set a new one.</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${resetUrl}" style="background:#0D9488;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block">Reset My Password</a>
            </div>
            <p style="color:#9CA3AF;font-size:13px;text-align:center;margin:0">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          </div>
          <div style="text-align:center;color:#9CA3AF;font-size:13px">
            <p style="margin:0">Padel Players App — BS3 Padel</p>
            <p style="margin:4px 0 0"><a href="https://padelplayersapp.com" style="color:#0D9488">padelplayersapp.com</a></p>
          </div>
        </body>
        </html>
      `;
    } else {
      console.log("Unhandled email type:", emailType);
      return new Response(JSON.stringify({ message: "Email type not handled" }), {
        status: 200,
        headers: corsHeaders,
      });
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
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Return in format Supabase hook expects
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Hook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});