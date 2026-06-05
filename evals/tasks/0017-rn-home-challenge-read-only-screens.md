---
Task: EVAL-0017
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0014(G5 Expo Router skeleton) complete + EVAL-0016(G7 read model contract) complete.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/03-rn-migration-rules.md, docs/migration/04-rn-architecture.md
---

# EVAL-0017: G8 Home + challenge read-only screens — real Supabase data

> 00 §8 G8. This ports read-only user value after route shell and read contracts exist.

## Parent Links

- Parent PRD Feature: home/challenge feed/dashboard/info read parity — [docs/PRD.md](../../docs/PRD.md) §4, §7, §10.
- Parent Test Scenario: feed/read scenarios [TS-3.1~3.6 and TS-4.1~4.3](../../docs/stories/2026-06-02-photo-verification-test-scenarios.md).
- Parent Job Story: 사용자가 동료 인증과 목표 현황을 보고 계속 참여한다 — [docs/stories/2026-06-02-photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S3~S4.
- Parent Engineering Story: [00 §7 Phase 3 Read-only App Parity](../../docs/migration/00-rn-conversion-plan.md) + [04 §5 data layer](../../docs/migration/04-rn-architecture.md).
- Parent Work Package: `feat/rn-read-only-screens` (G8).

## Goal

RN에서 로그인 사용자 기준 홈과 챌린지 read-only 화면이 실 Supabase 데이터로 렌더된다. 이 task가 끝나면 홈은 진행/미서명/종료 대기 상태를 보여주고, 챌린지 상세는 feed/dashboard/info 화면에서 기존 PWA와 같은 핵심 상태를 표시한다. 사용자는 아직 create/pledge/action mutations를 수행하지 않아도, web에서 만들어진 데이터가 RN에서 RLS 경계 안에서 읽히는 것을 확인할 수 있다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `docs/stories/2026-06-02-photo-verification-job-stories.md`
- `docs/stories/2026-06-02-photo-verification-test-scenarios.md`
- `apps/web/src/app/(app)/home`
- `apps/web/src/app/(app)/challenge/[id]`
- `apps/web/src/lib/db/reads`

## Target Files

- `apps` — implement mobile home and challenge read-only screens/components/hooks.
- `packages/domain` — consume shared done-day/penalty/keyword types; no reimplementation.
- `apps/web/src/lib/db/reads` — source parity reference only.

## Requirements

- Home screen renders authenticated user's current/pending/closed challenge summary using EVAL-0016 read contracts.
- Challenge feed renders cards with author, photo, keywords, AI diary summary, created time, empty state, image failure state, and access boundary behavior.
- Dashboard/info render goal count, done count, period, participant/member summary, penalty/settlement display as POC read-only semantics require.
- RLS membership boundaries are preserved. Non-members must not see feed/photo data.
- Signed photo URL/cache behavior follows the read contract; mobile image cache cannot extend private URL exposure beyond the contract.
- Use mobile-native components and safe-area/scroll behavior; do not copy DOM/Tailwind components.
- No write mutations except analytics read/view events already approved by PRD §9.1.

## Non-goals

- Challenge creation, invite accept, pledge sign, start challenge — EVAL-0018.
- Native action log submission — EVAL-0019.
- Push notifications, notification center, recap/share polish.
- Changing read contracts decided in EVAL-0016.
- P1/P2 greenfield settlement/auto-verification screens.

## Acceptance Criteria

| 기준                     | 검증 방법                                                                         |
| ------------------------ | --------------------------------------------------------------------------------- |
| home real data           | logged-in user sees real current/pending/closed challenge summaries from Supabase |
| feed real data           | challenge feed renders existing action logs with private photos and text metadata |
| dashboard/info real data | doneCount/goalCount/period/member/penalty info matches PWA fixtures               |
| RLS boundary             | non-member account gets no protected feed/photo data                              |
| empty/error states       | empty feed and image failure states are visible and non-crashing                  |
| mobile layout smoke      | iOS/Android-sized viewport/dev build has no blocking overlap for core screens     |
| harness traceability     | `pnpm harness:check` passes                                                       |

## Verification Commands

```bash
pnpm harness:context EVAL-0017
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- read-only
pnpm harness:check
pnpm validate:docs
# manual/dev-build: login -> home -> challenge feed/dashboard/info with seeded Supabase data
```

## Expected Output Summary

완료 보고는 RN 홈/챌린지 read-only 화면이 소비한 contract, 실데이터 smoke 결과, PWA 대비 주요 read parity, RLS/photo boundary 검증, 남은 mutation/action-log 후속을 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — home/challenge feature components/hooks.
2. Did this task introduce a new naming convention? Maybe — query key naming from EVAL-0016.
3. Did this task introduce a new dependency? No unless already accepted by architecture/spec.
4. Did this task change verification commands? Maybe — read-only screen tests or Maestro smoke.
5. Did this task reveal that the current harness instructions are outdated? Maybe — if screenshot/mobile smoke becomes mandatory.
6. Should any `.agents/` document be updated? Only if verification workflow changes.

## Stop Condition

- Home + challenge feed/dashboard/info render real data for authenticated users.
- RLS negative path and empty/error states are verified.
- pass@3 안에 green 못 만들면 home / feed / dashboard-info로 split.
