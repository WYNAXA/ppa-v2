/**
 * Round-trip test: propose → confirm via poll-scheduler.
 * Deployed as an edge function (service-role access for fixtures).
 *
 * Deploy: supabase functions deploy roundtrip-test --project-ref timbjfihsxqfrqrxwdny
 * Run:    curl https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/roundtrip-test \
 *           -H "Authorization: Bearer <publishable_key>"
 */
