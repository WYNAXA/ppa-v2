import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}
console.log('[Supabase] URL:', SUPABASE_URL?.slice(0, 30), 'Key exists:', !!SUPABASE_ANON_KEY)

/**
 * The client is typed against the generated schema.
 *
 * It was untyped until now, which meant every `.from()` and `.rpc()` returned
 * `any` and `tsc` never checked a single query against the real database. That
 * is how `select('id, name, season')` on `leagues` shipped: `leagues.season`
 * does not exist, PostgREST rejected the request with a 400, `?? []` swallowed
 * the error, and leagues silently never appeared in search results.
 *
 * Regenerate after every migration:
 *   npx supabase gen types typescript --project-id timbjfihsxqfrqrxwdny \
 *     > src/lib/database.types.ts
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
