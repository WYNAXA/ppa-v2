# Group Admin Model

## Current State (Phase 1 — completed)

Two sources of truth exist for group admin status:

| Source | Column | Usage |
|--------|--------|-------|
| `groups.admin_id` | UUID of group creator | Legacy. Used by RLS policies, DB triggers, CreateGroupSheet |
| `group_members.role = 'admin'` | Per-member role field | Modern. Supports multi-admin. Set by promote/demote in GroupDetail |

**Canonical check:** `useIsGroupAdmin(groupId)` hook (or `checkIsGroupAdmin()` for async contexts) in `src/hooks/useIsGroupAdmin.ts`. Returns `true` if EITHER source grants admin.

All UI admin checks now go through this single function. Direct references to `admin_id` or `role === 'admin'` outside the hook are flagged by ESLint.

## Long-Term Direction (Phase 2 — future)

Retire `groups.admin_id`. `group_members.role` becomes the single source of truth.

### Migration Steps

1. **Data migration:** For every group, ensure the `admin_id` user also has `role = 'admin'` in `group_members`. (Most already do via CreateGroupSheet.)
2. **RLS policies:** Update all policies referencing `groups.admin_id` to check `group_members.role` instead.
3. **DB triggers:** Update any triggers that reference `admin_id`.
4. **Code cleanup:** Remove `admin_id` from `groups` select queries, GroupRow types, CreateGroupSheet insert.
5. **Column drop:** `ALTER TABLE groups DROP COLUMN admin_id;`

### Why Not Now

- RLS policies reference `admin_id` and cannot be changed in a code-only PR
- DB triggers may depend on `admin_id` for ownership checks
- The dual-check approach in `useIsGroupAdmin` is safe and correct for both models

## Enforcement

An ESLint `no-restricted-syntax` rule in `eslint.config.js` blocks any `MemberExpression[property.name='admin_id']` — i.e. any `.admin_id` property access in TypeScript/TSX files.

**Adding a new admin check:**
- In React components: `const { isAdmin } = useIsGroupAdmin(groupId)`
- In async/non-React code: `const isAdmin = await checkIsGroupAdmin(groupId, userId)`
- Never access `.admin_id` directly on a group object

**Legitimate exceptions** (marked with `eslint-disable-next-line`):
- `src/hooks/useIsGroupAdmin.ts:33` — canonical reader, checks legacy admin_id
- `src/components/community/CreateGroupSheet.tsx:75` — sets admin_id on creation (object literal, doesn't trigger)
- `src/pages/GroupDetail.tsx:321` — ownership transfer mutation (object literal, doesn't trigger)
