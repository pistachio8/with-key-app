---
Task: EVAL-0022
Track: greenfield
Kind: migration
Status: todo
Depends-on: EVAL-0020(컬럼)·EVAL-0021(신호 골격) 구현 — intra-feature 순서(게이트 아님, EVAL-0006 선례). G1-θ는 잠정확정·주입됨(2026-06-05, 실측 PoC open).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0022: θ 임계 자동검증 판정 — 결정론 신호 → status 결정 (기본 passed · 명백 부정만 failed)

> WP2b (`feat/rn-verify-judge`). **G1-θ 해제** — θ 잠정확정·주입(2026-06-05). EVAL-0021·EVAL-0020 선행. **주입 θ**로 신호 → status 판정만(하드코딩 금지).

## Parent Links

`AC-auto-verify-1`~`3`·`AC-cheat-detect-2` — [01-rn-mvp-prd §5.B](../../docs/migration/01-rn-mvp-prd.md) · raw: [raw-job-stories](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md) · `JS-verify-1`·`JS-verify-3` — [p2-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md) · [photo-verification WP2](../../docs/eng-stories/2026-06-05-photo-verification.md) · WP: `feat/rn-verify-judge`

## Goal

EVAL-0021 신호 → status 판정을 완성한다. 기본 `passed`, 명백 부정만 `failed`, 경계만 `manual_review`, phash 재사용 `failed`/`manual_review`; 결과·`model_version`을 EVAL-0020 컬럼에 서버 write(θ 외부 주입).

## Source Files to Inspect

- `docs/migration/01-rn-mvp-prd.md`
- `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md`
- `.agents/harness/config/harness.config.example.json`
- `docs/adr/0032-settlement-verification-data-model.md`
- `evals/tasks/0021-verify-deterministic-signals-skeleton.md`
- `evals/tasks/0020-verify-data-columns-migration.md`
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts`

## Target Files

- `apps/web/src/lib/` — 신규 `verify/judge.ts` (SECURITY DEFINER RPC 또는 서버 전용, service_role write)
- `apps/web/src/lib/` — 판정 단위 테스트 `verify/judge.spec.ts`

## Requirements

- EVAL-0021 신호 + 외부 주입 θ → `passed | failed | manual_review`. **θ 하드코딩 금지** — server env(`VERIFY_PHASH_FAIL_MAX`·`VERIFY_PHASH_REVIEW_MAX`·`VERIFY_ENFORCE`)를 `verify/config.ts` zod로 읽음. `NEXT_PUBLIC_` 금지.
- 기본 `passed`(`AC-auto-verify-1`), 명백 부정만 `failed`(`AC-auto-verify-2`), 경계만 `manual_review`(`AC-auto-verify-3`).
- **phash**(`AC-cheat-detect-2`): 동일 user/group `d≤6` → `failed`; cross-user 최대 `manual_review`.
- **shadow**: `VERIFY_ENFORCE=false` → would-be 기록만; `true`에서만 `failed` 카운트 제외.
- `manual_review`는 doneCount 인정. `failed`도 피드 잔존(복구 = EVAL-0024 사진 교체).
- status·`model_version` write는 service_role. 본문 미로깅.

## Non-goals

신호 계산(EVAL-0021) / 컬럼·가드(EVAL-0020) / 피어 반려(EVAL-0025) / θ 값 결정(PO 정책, 본 task는 해석만).

## Acceptance Criteria

| 기준                                    | 검증 방법                                         |
| --------------------------------------- | ------------------------------------------------- |
| 기본 passed (`AC-auto-verify-1`)        | 청정 신호 → `passed`                              |
| 명백 부정 failed (`AC-auto-verify-2`)   | θ 초과 → `failed`, 잔존·카운트 제외               |
| 경계 manual_review (`AC-auto-verify-3`) | 경계 신호 → `manual_review`                       |
| 재탕 차단 (`AC-cheat-detect-2`)         | 동일 user/group `d≤6` → `failed`; cross-user 아님 |
| shadow mode                             | `VERIFY_ENFORCE=false` → would-be만, doneCount 0  |
| manual_review 카운트                    | `manual_review` → doneCount 인정                  |
| θ 외부 주입                             | θ 하드코딩 부재, env zod, `NEXT_PUBLIC_` 부재     |
| harness traceability                    | `pnpm harness:check` 통과                         |

## Verification Commands

```bash
# G1-θ 해제. EVAL-0020·EVAL-0021 구현 후:
pnpm harness:context EVAL-0022
pnpm typecheck && pnpm lint
pnpm test -- verify-judge   # θ 픽스처 주입 판정 테이블 테스트
pnpm harness:check
```

## Expected Output Summary

θ 주입 인터페이스, 신호 → status 매핑, 재탕 처리, service_role write를 한국어로 요약한다.

## Harness Impact Questions

1~6: No — EVAL-0021 `lib/verify/` 재사용, 신규 폴더·의존·명명·검증 커맨드·설명 변경 없음.

## Stop Condition

EVAL-0020·EVAL-0021 구현 후 모든 AC green + `pnpm harness:check` 통과. 실측 G1 PoC는 후속(주입값 교체). pass@3 green 불가 시 판정 규칙 단위로 split(05 §9.4).
