---
Task: EVAL-0004
Track: port
Kind: migration
Status: todo
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/01-rn-mvp-prd.md, docs/migration/02-rn-migration-harness.md
---

# EVAL-0004: RN Phase 0 — Inventory Freeze

## Parent Links

- Parent PRD: [docs/PRD.md](../../docs/PRD.md)
- Parent RN MVP PRD: [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md)
- Parent Conversion Plan: [docs/migration/00-rn-conversion-plan.md](../../docs/migration/00-rn-conversion-plan.md)
- Parent Harness: [docs/migration/02-rn-migration-harness.md](../../docs/migration/02-rn-migration-harness.md)
- Parent Work Package: `feat/harness-phase0-inventory-task`

## Goal

RN 기능 포팅을 시작하기 전에 Phase 0 inventory freeze의 완료 조건을 실행 가능한 Agent Task로 고정한다. 이 task가 완료되면 user-facing route, Server Action, 핵심 read path가 RN에서 어떻게 처리될지 문서에 분류되어 있고, 이후 `EVAL-0005+` 기능 포팅 task가 같은 기준을 Parent로 인용할 수 있다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/01-rn-mvp-prd.md`
- `docs/migration/02-rn-migration-harness.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `src/app`
- `src/lib/db/reads`

## Target Files

- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/02-rn-migration-harness.md`
- `evals/tasks/0004-rn-phase0-inventory-freeze.md`

## Requirements

- user-facing route 목록은 RN 처리 방식으로 분류되어 있어야 한다.
- Server Action export 목록은 RPC 직접 호출, BFF API 유지, RN direct client 처리, 폐기 중 하나로 분류되어 있어야 한다.
- 핵심 read path는 RN-safe contract 필요 여부와 service-role/cache/cookie 의존 여부가 드러나야 한다.
- Phase 1로 넘어가기 전에 필요한 ADR/spec 항목을 식별해야 한다.
- `EVAL-0005+` 기능 포팅 task가 이 inventory를 Parent로 인용할 수 있어야 한다.

## Non-goals

- `apps/mobile` 생성 또는 Expo 앱 부트스트랩.
- `apps/web` 모노레포 이동.
- Supabase migration, RLS 정책, RPC 변경.
- 실제 RN 화면 또는 native capability 구현.

## Acceptance Criteria

| 기준                  | 검증 방법                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| route matrix freeze   | `docs/migration/00-rn-conversion-plan.md`에 user-facing route별 RN 처리 방식이 유지되고, 누락 route가 없음을 `src/app/**/page.tsx` 대조로 확인 |
| action matrix freeze  | `_actions.ts` export가 RN 대상 계약으로 분류됨. 분류는 RPC direct, BFF API, RN direct client, deprecated/alias 중 하나                         |
| read matrix freeze    | 핵심 read 함수가 RN-safe contract 또는 server-only/BFF 필요로 분류되고, service-role/cache/cookie 의존 여부가 표시됨                           |
| decision debt visible | Phase 1 전에 필요한 ADR/spec가 문서에 명시됨                                                                                                   |
| harness traceability  | `pnpm harness:check`가 이 task의 frontmatter, Parent, Source Files, Target Files 경로를 검증하고 통과                                          |

## Verification Commands

```bash
pnpm harness:context EVAL-0004
pnpm harness:check
pnpm harness:drift
pnpm validate:docs
```

## Expected Output Summary

Phase 0 inventory freeze가 완료되면 route/action/read matrix의 변경 위치, 남은 decision debt, 다음으로 생성할 `EVAL-0005+` 후보를 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No; it follows `EVAL-0004` and `evals/tasks/0004-*`.
3. Did this task introduce a new dependency? No.
4. Did this task change verification commands? No; it exercises existing `harness:*` commands.
5. Did this task reveal that the current harness instructions are outdated? Yes; skeleton scripts must become deterministic Tier 1 checks.
6. Should any `.agents/` document be updated? Not for this task definition; script implementation should match the existing template contract.

## Stop Condition

- All Acceptance Criteria are checkable.
- `pnpm harness:check` passes for `EVAL-0004`.
- `pnpm harness:context EVAL-0004` prints the Parent, Source Files, Target Files, and verification commands needed by an implementer.
