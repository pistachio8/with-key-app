---
Task: EVAL-0024
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0024: 사진 1회 교체 — 마감 전 단순 실수 정정 (immutability 좁은 예외)

> WP4 (`feat/rn-verify-replace`). 외부 게이트 없음 → `todo`(선례 EVAL-0006). **WP1/EVAL-0020 의존**(immutability 예외 컬럼·트리거). 교체 시 부정탐지 재실행은 EVAL-0021 위에서 동작(활성 판정은 G1/EVAL-0022 후속).

## Parent Links

- Parent PRD Feature: `AC-auto-verify-5`(마감 전 1회 교체·부정탐지 재실행, Q9) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-2`(잘못 올린 사진을 마감 전 한 번 바로잡는다) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP4
- Parent Work Package: `feat/rn-verify-replace` (WP4)

## Goal

잘못 올린 인증을 억울하게 날리지 않게 한다. **마감 전 1회** 사진 교체가 가능하고, EVAL-0020 immutability 예외로 사진 경로를 갱신하며 부정탐지 신호(EVAL-0021)를 재실행한다. 2회째·마감 후 교체는 차단된다.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (immutability 예외 Q9)
- `docs/eng-stories/2026-06-05-photo-verification.md` (WP4)
- `evals/tasks/0020-verify-data-columns-migration.md` (EVAL-0020 immutability 예외 — 의존; 구현 후 `supabase/migrations/0044_*`)
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` (action log 제출/교체 경로)
- `apps/web/src/lib/storage/action-photos.ts`
- `evals/tasks/0021-verify-deterministic-signals-skeleton.md` (EVAL-0021 신호 재실행 — 구현 후 `apps/web/src/lib/verify/`)

## Target Files

- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` — 사진 교체 Server Action(1회 제한·마감 전 가드)
- `apps/web/src/lib/storage/action-photos.ts` — 교체 사진 업로드
- (교체 카운트/상태) action_logs 1회 제한 추적 — EVAL-0020 컬럼/플래그 (Server Action 내 상태 관리)

## Requirements

- 마감 전 1회만 교체 — 2회째·마감 후 차단(서버 가드).
- 교체는 Server Action(`_actions.ts`) 일원화(클라 직접 write 금지).
- 교체 시 부정탐지 신호 재실행(EVAL-0021) — phash/EXIF/스크린샷 재계산.
- immutability 예외는 EVAL-0020 범위 내(사진 교체만, 본문 불변).

## Non-goals

- immutability 예외 migration·트리거 정의 — WP1/EVAL-0020(본 task는 사용만).
- 교체 후 status 활성 판정 — WP2b/EVAL-0022(본 task는 신호 재실행까지).
- 피어 반려 상호작용 — WP5/EVAL-0025.

## Acceptance Criteria

| 기준                                  | 검증 방법                                        |
| ------------------------------------- | ------------------------------------------------ |
| 마감 전 1회 교체 (`AC-auto-verify-5`) | 1회 성공 → 사진 경로 갱신 (Server Action 테스트) |
| 2회째 차단                            | 2회 시도 → 거부                                  |
| 마감 후 차단                          | 마감 이후 시도 → 거부                            |
| 부정탐지 재실행                       | EVAL-0021 신호 재계산 호출 확인                  |
| Server Action 경로                    | 교체 write가 `_actions.ts` 경유 코드 대조        |
| harness traceability                  | `pnpm harness:check` 통과                        |

## Verification Commands

```bash
pnpm harness:context EVAL-0024
pnpm typecheck && pnpm lint
pnpm test -- action-log    # 교체 1회 제한·마감 가드 성공/실패 shape
pnpm harness:check
# 모바일 viewport 수동 확인 (교체 흐름)
```

## Expected Output Summary

교체 Server Action 위치, 1회 제한·마감 가드, 부정탐지 재실행 hook, immutability 예외 범위, EVAL-0020 의존을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — 기존 route colocation `_actions.ts`.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 갱신? No.

## Stop Condition

- 1회 제한·마감 가드·재실행 AC green + 모바일 viewport 확인 + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 교체 가드 / 재실행으로 split(05 §9.4).
