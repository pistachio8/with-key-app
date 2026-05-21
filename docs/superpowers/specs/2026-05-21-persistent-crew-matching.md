---
spec: 2026-05-21-persistent-crew-matching
title: Persistent Crew Matching
author: pistachio8
date: 2026-05-21
status: accepted
---

## Summary

Challenge creation now treats a group as a persistent crew. If the owner already
has exactly one active group, a new challenge attaches to it instead of creating
another "`{displayName}님과 친구들`" group. If the owner has multiple groups, the
form and Server Action both require an explicit group selection.

This implements [ADR-0012](../../adr/0012-group-persistent-crew-model.md) while
preserving ADR-0003's first-challenge zero-friction auto group creation.

## Why

- Repeated challenges with the same friends were creating duplicate groups.
- Duplicate groups split settlement accounts and challenge history.
- ADR-0011 already models group 1:N challenge ownership.
- Server-side validation is required because Server Actions are directly
  invokable POST endpoints.

## Impact Scope

### 변경 경로

- 신규: `src/lib/db/reads/owner-groups-for-challenge-form.ts`
- 신규: `src/app/(app)/challenge/new/_components/new-challenge-form.tsx`
- 수정: `src/app/(app)/challenge/new/page.tsx`
- 수정: `src/app/(app)/challenge/new/_actions.ts`
- 신규/사용: `src/components/ui/select.tsx`

### src/ 영향

The `challenge/new` route becomes a server page that fetches owner groups and
passes them to a colocated client form. The Server Action uses the same owner
group read to enforce the matching rule.

### Supabase / RLS / migration 영향

No schema or RLS change is required for matching. Existing owner checks remain
inside the `create_challenge` RPC.

### 외부 서비스

없음.

## Design

### C1. Owner Group Read

`fetchOwnerGroupsForChallengeForm(ownerId)` returns active groups owned by the
viewer and annotates each with its latest challenge `created_at`.

Sorting rule:

1. Groups with the newest challenge history first.
2. Groups without challenge history after those with history.
3. Ties fall back to group `created_at` descending.

Why: `/challenge/new` needs the same default as Q6-A in the plan, and the Server
Action must decide 0/1/N without duplicating query behavior.

### C2. Server Action Matching

`createChallenge` accepts optional `groupId`.

- `groupId` present: pass through to `create_challenge`; RPC validates owner.
- `groupId` absent and owner has 0 groups: create default auto group.
- `groupId` absent and owner has 1 group: attach to that group.
- `groupId` absent and owner has 2+ groups: return `invalid_input` with
  `issues.groupId`.

Why: client UI can be bypassed, so the 2+ group rule cannot be UI-only.

### C3. Form UI

The client form receives `ownerGroups` and `initialGroupId`.

- 0 groups: hide group UI.
- 1 group: show a one-line "`{groupName} 그룹에서 시작`" label.
- 2+ groups: show a dropdown, defaulting to `?groupId` when owned by the viewer,
  otherwise the most recently used group.

Why: the common one-group case stays frictionless while multi-crew users make a
deliberate choice.

## Alternatives Considered

### Always Native Select

Rejected because the UI h-11 SoT plan has already selected a base-ui Select
wrapper for consistent mobile form controls.

### Always Create New Group

Rejected because it preserves the duplicate crew/account/history problem.

### Always Auto-Attach Most Recent Group

Rejected for 2+ groups because the wrong crew would be hard to notice before
invites are sent.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

### 시나리오

- Owner has 0 groups: challenge creation creates a default group and tracks
  `group_created`.
- Owner has 1 group: challenge creation calls `create_challenge` with that group
  and does not track `group_created`.
- Owner has 2+ groups and omits `groupId`: Server Action returns
  `invalid_input`.
- Owner has 2+ groups in UI: selector is visible and defaults to the most recent
  challenge group.
- `/challenge/new?groupId={ownedGroup}`: selector default uses that group.

## Rollout

Ship in the same PR as the group-management UI because the user objective asks
for one PR update from the current branch. Commits remain split by behavior.

### 롤백

Revert the matching commit and this spec. Existing data is not migrated, so
rollback is code-only.

## Out of scope

- Merging duplicate historical groups.
- Changing PRD analytics event names.
- Allowing multiple open challenges in one group.

## 용어집

- **Persistent crew**: 같은 친구 구성으로 반복 챌린지를 여는 지속 그룹.
- **Open challenge**: `pending`, `accepted`, `active` 상태의 챌린지.
- **Selector default**: 그룹 선택 dropdown의 초기 선택값.
