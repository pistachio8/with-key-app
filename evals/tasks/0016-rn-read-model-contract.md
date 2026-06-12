---
Task: EVAL-0016
Track: port
Kind: migration
Status: done
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/02-rn-migration-harness.md, docs/migration/04-rn-architecture.md, docs/adr/0036-rn-admin-hydrate-bff-contract.md
---

# EVAL-0016: G7 Read model contract — Home/challenge/group/recap/me RN-safe boundaries

> 00 §8 G7. 화면 데이터 소비 전 계약 고정. Next cache/cookie/admin hydrate 가정을 RN으로 이월 금지. **blocked 해제(2026-06-12)**: 선행 EVAL-0015(G6) done + D-4 admin hydrate RN 계약 ADR-0036 확정 — drift 해제 후보 advisory 검토 후 todo flip(선행이 develop 에 머지되어 base 는 develop).

## Parent Links

- PRD Feature: home/challenge/feed/group/recap/me — [docs/PRD.md](../../docs/PRD.md) §10.
- Test Scenario: read contract snapshot evals — [02 §5.2](../../docs/migration/02-rn-migration-harness.md).
- Job Story: [photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S3~S5.
- Engineering Story: [00 §13.3](../../docs/migration/00-rn-conversion-plan.md) + [04 §5 A8](../../docs/migration/04-rn-architecture.md).
- Work Package: `feat/rn-read-contracts` (G7).

## Goal

RN screens의 read model 계약을 고정한다. Home/challenge/group/recap/me가 RN-safe Supabase/RPC direct인지 BFF인지 명시되고, `next/cache`·cookies·admin hydrate 의존이 함수별로 드러난다. G8은 이 계약만 소비하며 RSC 함수를 복사하지 않는다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/02-rn-migration-harness.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/lib/db/reads`
- `apps/web/src/app/(app)/home`
- `apps/web/src/app/(app)/challenge/[id]`
- `apps/web/src/app/(app)/group/[id]`
- `apps/web/src/app/(app)/me`

## Target Files

- `apps` — mobile feature slice별 read service/API 계약 생성.
- `apps/web/src/lib/db/reads` — 추출 소스; drift 금지.
- `packages/domain` — 순수 view-model 타입만.
- `docs/adr` — D-4 미결 시 ADR 필수.

## Requirements

- 00 §13.3 read를 RLS/RPC direct·BFF로 분류. admin hydrate는 mobile 제외.
- 전 화면(home/challenge/feed/group/recap/me/profile) stable TS return type.
- 계약 경계에서 `cookies()`·`@supabase/ssr`·`next/cache` 제거.
- Layer 1 visibility 보존; admin hydrate 유지 시 RLS gate 후 BFF 노출.
- web vs RN-safe 계약 비교 fixture/snapshot(가능 범위).
- query-key/invalidation 기대값 문서화; spec 외 state-library 금지.
- RLS가 인가 경계; service-role 결과를 mobile client에 전달 금지.

## Non-goals

- Read-only 화면 구현(EVAL-0017), mutation(EVAL-0018), action log 제출(EVAL-0019).
- DB schema/RLS 변경, 제품 카피·IA 재작성.

## Acceptance Criteria

| 기준                        | 검증 방법                                          |
| --------------------------- | -------------------------------------------------- |
| full read matrix covered    | 00 §13.3 모든 read에 계약 분류                     |
| admin/cache/cookie visible  | service-role·cache·cookie 의존이 코드/docs 명시    |
| contract types stable       | 타입이 mobile·web 양쪽 컴파일                      |
| preservation snapshots      | home/challenge/recap/me fixture가 web model과 일치 |
| no mobile service-role leak | mobile에 admin client/secret 경로 없음             |
| harness traceability        | `pnpm harness:check` passes                        |

## Verification Commands

```bash
pnpm harness:context EVAL-0016
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- read
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

계약 분류표, admin hydrate BFF 경계, cache/cookie 제거 지점, snapshot 결과, G8 API 목록을 한국어로 요약.

## Harness Impact Questions

1. New folder structure? Maybe — mobile `api/`·`hooks/`.
2. New naming convention? Yes — query keys/read service names.
3. New dependency? No unless spec adds one.
4. Verification commands changed? Maybe — snapshot tests join mobile scope.
5. Harness outdated? Maybe — read matrix deterministic check 필요 시.
6. `.agents/` update? Only if read-contract checks become harness mechanics.

## Stop Condition

- 00 §13.3 모든 read에 계약·테스트 가능 경계 존재.
- 검증 커맨드 전부 통과.
- pass@3 실패 시 RLS-direct / BFF hydrate / recap-me로 split.
