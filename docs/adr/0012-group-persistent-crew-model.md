# ADR-0012: Group Persistent Crew Model

**Date**: 2026-05-21
**Status**: accepted
**Deciders**: pistachio8

## Context

ADR-0003 hid explicit group creation from the first challenge flow and let
`createChallenge` create "`{displayName}님과 친구들`" automatically. That worked
for onboarding, but repeated challenges with the same friends created new groups
each time. The result was split group history, split settlement accounts, and
duplicated header switcher entries.

ADR-0011 already defines group ownership separately from challenge lifecycle:
one group can own many challenges over time, while a partial unique index allows
only one open challenge per group. The UX now needs to match that model.

## Decision

Group means **persistent crew**: a stable friend composition that can run many
serial challenges.

- Challenge creation without `groupId` now branches by owner group count.
- Owner has 0 groups: keep ADR-0003 auto creation with the default name.
- Owner has 1 group: attach the new challenge to that group automatically.
- Owner has 2+ groups: require explicit group selection in the form and on the
  server. This avoids silently picking the wrong crew.
- `/challenge/new?groupId=...` has priority when the group is owned by the
  viewer. This keeps group-detail CTA flows deterministic.
- The default group selector is the group with the most recent challenge
  `created_at`; groups without challenges sort after those with challenge
  history.
- Explicit "new group" creation remains available from the header group switcher
  once the user belongs to at least one group.
- Safe group deletion is allowed only for owner + single-member + zero-challenge
  groups. `groups` receives an owner-only DELETE RLS policy; member count and
  challenge count stay application-level checks.

## Alternatives Considered

### 1. Keep group = challenge instance

- **Pros**: Minimal code change.
- **Cons**: Continues data fragmentation and contradicts ADR-0011.
- **Why not**: It preserves the exact bug this ADR addresses.

### 2. Always show group selector

- **Pros**: Very explicit and easy to reason about.
- **Cons**: Adds friction to first and second challenge creation, especially for
  the common one-group owner case.
- **Why not**: The POC still optimizes for low-friction mobile creation.

### 3. Merge existing duplicate groups automatically

- **Pros**: Cleans current dogfood data.
- **Cons**: Requires irreversible data migration across groups, members,
  challenges, invites, and account records.
- **Why not**: POC data volume is small; manual cleanup is cheaper and safer.

## Consequences

### 긍정적

- Repeated challenges reuse the same group/account/history by default.
- Users with one crew get zero extra UI steps.
- Users with multiple crews must make an explicit choice, avoiding accidental
  cross-crew challenge creation.
- Empty accidental groups can be removed safely.

### 부정적 / 비용

- `createChallenge` now performs an owner group read before auto creation.
- The challenge creation page becomes a server page plus client form so it can
  preload owner groups.
- Existing duplicate dogfood groups remain until manually deleted or ignored.

### 후속 영향

- ADR-0003 is extended, not superseded: first-challenge auto creation remains.
- `src/lib/db/reads/owner-groups-for-challenge-form.ts` is the read-side SoT for
  matching and selector ordering.
- `supabase/migrations/0030_groups_owner_delete_policy.sql` adds the RLS surface
  needed by safe deletion.
