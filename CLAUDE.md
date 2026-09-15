# CLAUDE.md

## Migrations applied through the Supabase MCP

A migration applied through the MCP gets its version assigned by the database,
not by the filename you chose. After applying, always:

1. Read the assigned version from `supabase_migrations.schema_migrations`
2. Name the repo file with THAT version
3. Verify md5 of the file contents (minus trailing newline) equals
   `md5(statements[1])` for that version
4. Never leave a local-only migration file that recreates something the
   fixed version replaced — on a `db push` it silently undoes the fix

NEVER run `supabase db push` against this project. The local migration
history does not reproduce the live schema, and a push would replay
superseded migrations against production — including ones that recreate
functions a later migration deliberately dropped. Apply through the MCP and
write the file to match, as above. This restriction lifts only when
`supabase migration list` shows zero local-only and zero remote-only rows.
