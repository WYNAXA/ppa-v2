# Backlog / roadmap

Deferred follow-ups (not blockers). Newest first.

## Guest-invite feature follow-ups

- **Universal Links (iOS) + App Links (Android)** — make the invite link open the
  **native app directly** into the match when installed (deep link), falling back
  to web / the app store when not. Requires:
  - Host `apple-app-site-association` (iOS) and `assetlinks.json` (Android) on the
    app domain (`v2.padelplayersapp.com` / `app.*`).
  - Native project config: Associated Domains entitlement (iOS), intent filters
    (Android) for `/join/match/*`.
  - App Store / Play Store: `id6762192246` / `com.wynaxa.padelplayers`.
  Until then, the invite link opens the PWA in the browser and a web-gated
  "Get the app" nudge (added 2026-07-29) points people to the stores.

- **Cancel-invite RPC** — removing a pending guest in Edit currently just drops
  their `player_ids` slot; it does not cancel the outstanding invite link, so a
  stale link could still be tapped (harmless: the claim no-ops because the slot
  is gone, and they land on the match without being added). Add a
  `cancel_match_guest_invite(slot_or_token)` SECURITY DEFINER RPC and call it on
  removal to make it airtight.

## From the 2026-07-28 audit (see AUDIT_2026-07-28.md)

- **Payments (Critical)** — no Stripe payment webhook; amount/paid-state
  reconciled client-side. Deliberately untouched per owner; still open.
- **rebuild-ratings commit mode is broken** — badge-trigger suppression doesn't
  persist across PostgREST calls, so `{dry_run:false}` times out. Use the
  `emit_sql` output as one transaction instead; fix the function to commit in a
  single tx/RPC. (KNOWN_ISSUES.md)
- **Migration history drift** — 119 local migrations not recorded in the remote
  `schema_migrations`, so `supabase db push` is unsafe. Reconcile with
  `supabase migration repair --status applied …`.
- **Rotate the `service_role` key** — it was stored in plaintext in
  `.claude/settings.local.json`. (Legacy keys were already disabled 2026-07-07;
  confirm the new secret key isn't similarly exposed.)
