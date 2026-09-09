import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://padelplayersapp.com/auth" },
    });

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Failed to generate link" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const resetLink = data.properties.action_link;

    const html = `<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#fff">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="color:#0D9488;font-size:28px;font-weight:700;margin:0">Padel Players App</h1>
    <p style="color:#6B7280;font-size:14px;margin:4px 0 0">Your padel community</p>
  </div>
  <div style="background:#F0FDFA;border-radius:16px;padding:32px;margin-bottom:24px">
    <h2 style="color:#111827;font-size:20px;margin-top:0">Reset your password</h2>
    <p style="color:#6B7280;font-size:15px;line-height:1.6">We received a request to reset your password. Click below to set a new one.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resetLink}" style="background:#0D9488;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block">Reset My Password</a>
    </div>
    <p style="color:#9CA3AF;font-size:13px;text-align:center;margin:0">This link expires in 1 hour. If you did not request this, ignore this email.</p>
  </div>
  <div style="text-align:center;color:#9CA3AF;font-size:13px">
    <p style="margin:0">Padel Players App - BS3 Padel</p>
    <p style="margin:4px 0 0"><a href="https://padelplayersapp.com" style="color:#0D9488">padelplayersapp.com</a></p>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@padelplayersapp.com",
        to: email,
        subject: "Reset your Padel Players App password",
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});