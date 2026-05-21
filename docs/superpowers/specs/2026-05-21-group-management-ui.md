---
spec: 2026-05-21-group-management-ui
title: Group Management UI
author: pistachio8
date: 2026-05-21
status: accepted
---

## Summary

This spec adds the management affordances required by the persistent crew model:
start a new challenge from a group, create a second group from the header
switcher, rename a group, and safely delete accidental empty groups.

The implementation follows [ADR-0012](../../adr/0012-group-persistent-crew-model.md)
and keeps all writes behind Server Actions.

## Why

- Persistent crews need an explicit way to create a different crew.
- Users need a low-friction way to rename the default "`님과 친구들`" group.
- Accidental empty groups should be removable without data migration.
- The header switcher must appear at one group, not only two groups, so the
  second-group entrypoint is discoverable.

## Impact Scope

### 변경 경로

- 신규: `src/components/app-shell/new-group-dialog.tsx`
- 수정: `src/components/app-shell/app-header.tsx`
- 수정: `src/components/app-shell/group-switcher-trigger.tsx`
- 수정: `src/components/app-shell/group-switcher-sheet.tsx`
- 수정: `src/app/(app)/group/new/_actions.ts`
- 수정: `src/app/(app)/group/[id]/_actions.ts`
- 수정: `src/app/(app)/group/[id]/_components/group-header.tsx`
- 수정: `src/lib/validators/group.ts`
- 신규: `supabase/migrations/0030_groups_owner_delete_policy.sql`

### src/ 영향

Group management writes are still Server Actions:

- `createGroup` supports optional name and default `#N` naming.
- `renameGroup` validates `groupId` and name with zod.
- `deleteGroup` enforces owner + member count + challenge count before deleting.

### Supabase / RLS / migration 영향

`groups_update_owner` already exists. `groups` did not have a DELETE policy, so
`0030_groups_owner_delete_policy.sql` adds owner-only delete. The stricter safe
delete conditions stay in application code because they involve aggregate counts.

### 외부 서비스

없음.

## Design

### C1. Group Detail CTA

Owners see "이 그룹에서 새 챌린지" on group detail. The link points to
`/challenge/new?groupId={id}`. If the group has a `pending`, `accepted`, or
`active` challenge, the CTA is disabled with "현재 진행 중인 챌린지가 있어요".

Why: ADR-0011 allows only one open challenge per group, so the UI should prevent
the most obvious conflict before submit.

### C2. Header Switcher Entry Point

The header group icon opens the group switcher for `groups.length >= 1`. The
switcher still lists existing groups and adds a button that opens a create-group
dialog. Users with zero groups keep the existing `/group/new` fallback link.

Why: a user with exactly one group needs a place to create a second group.

### C3. Default Group Naming

`createGroup` accepts an omitted or blank name. It computes:

- 0 existing owner groups matching the default pattern: `{displayName}님과 친구들`
- 1 existing default-pattern group: `{displayName}님과 친구들 #2`
- N existing default-pattern groups: `{displayName}님과 친구들 #{N+1}`

The final name is clamped to the database max length of 30 chars.

Why: explicit group creation should not force naming, but generated names must
avoid immediate duplicates.

### C4. Rename

Owners can open a pencil-icon dialog from the group header. The Server Action
checks owner ownership by updating `groups` with `id` + `owner_id` filters and
returns `forbidden` when no row is changed.

Why: RLS is a backstop, but the action should provide deterministic error codes.

### C5. Safe Delete

Owners can delete only when:

- member count is exactly 1
- challenge count is exactly 0, regardless of challenge status

The delete icon is disabled with a reason when either condition fails. The Server
Action repeats the checks before DELETE.

Why: deleting a group with friends or any challenge history would erase shared
context and linked records.

## Alternatives Considered

### Restore `/group/new` Page

Rejected because the current POC IA intentionally keeps creation inside the app
shell and challenge/group flows.

### Auto-Prompt Rename After Auto Creation

Rejected because it adds friction to first challenge creation. Rename remains
discoverable from group detail.

### Archive Instead of Delete

Rejected for this POC because safe deletion covers only empty accidental groups.
Archive can be revisited for historical groups later.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

### 시나리오

- Group detail owner with no open challenge sees a link to
  `/challenge/new?groupId={id}`.
- Group detail owner with an open challenge sees a disabled CTA.
- Header with one group opens the group switcher.
- Header switcher create dialog creates a group with optional name.
- `createGroup({})` generates base, `#2`, and `#3` names.
- Rename rejects blank names and updates owner groups.
- Delete rejects non-owner, member count >= 2, challenge count >= 1, and succeeds
  for one-member zero-challenge groups.

## Rollout

Ship in the same branch as persistent crew matching, with separate commits for
matching, management UI, and safe delete.

### 롤백

Revert the management UI/action commits. If the delete RLS migration has been
applied, leave it in place or add a forward migration to drop the policy.

## Out of scope

- Merging duplicate historical groups.
- Group archive/disband flows.
- Editing members from group detail.

## 용어집

- **Default-pattern group**: a group named `{displayName}님과 친구들` with optional
  ` #N` suffix.
- **Safe delete**: deleting only an owner-owned, single-member, zero-challenge
  group.
- **Switcher**: the app-header dialog used to move between groups.
