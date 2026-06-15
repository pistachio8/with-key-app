---
Task: EVAL-0026
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0026: 운영 알림 + AnalyticsEvent — failed·반려율 임계 초과 시 그룹 알림 + 검증 이벤트

> WP6 (`feat/rn-verify-ops`) **부모 WP**. **spec blocked** — 자동검증·반려 이벤트는 PRD §9.1 union 1:1 spec 선행(ES §게이트). WP5(EVAL-0025) → WP6. 알림은 θ 무관, 이벤트 union 변경이 spec 게이트.
> 게이트 해소 후 두 서브 task로 분해됨: **EVAL-0030**(WP1 이벤트 계약 + producer) · **EVAL-0031**(WP2 운영 이상 알림). 구현 착수는 서브 task에서 진행한다.

## Parent Links

- Parent PRD Feature: `AC-owner-load-3`(`failed`·반려율 임계 그룹 알림) + 자동검증·반려 AnalyticsEvent(PRD §9.1 union 1:1) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-6` — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP6
- Parent Work Package: `feat/rn-verify-ops` (WP6)

## Goal

부정탐지 오작동·그룹 갈등을 조기 감지하고 검증 흐름을 분석 가능하게 한다. `failed`·반려율 임계 → 그룹 알림(`AC-owner-load-3`). 자동검증·피어 반려는 **PRD §9.1 union 1:1 AnalyticsEvent**로 기록(spec 선행, 임의 이벤트 금지). `track.ts` union ↔ zod parity 테스트로 강제.

## Source Files to Inspect

- `docs/eng-stories/2026-06-05-photo-verification.md` (WP6)
- `docs/PRD.md` §9.1 (AnalyticsEvent union SoT)
- `apps/web/src/lib/analytics/track.ts` · `track.spec.ts`
- `apps/web/src/lib/analytics/schema.ts` · `schema-union-parity.spec.ts`
- `supabase/migrations/0040_all_signed_owner_nudge.sql` (기존 알림 패턴)

## Target Files

- `docs/superpowers/specs/` — **선행 spec**: 자동검증·반려 AnalyticsEvent(PRD §9.1 union 1:1, PO 승인)
- `apps/web/src/lib/analytics/track.ts` · `schema.ts` — union·zod 추가(spec 확정 후)
- `apps/web/src/app/(app)/` 또는 알림 경로 — `failed`·반려율 임계 알림

## Requirements

- `failed`·반려율 임계 → 그룹 알림(`AC-owner-load-3`); `owner_nudge` 패턴 재사용.
- 자동검증·반려 이벤트는 PRD §9.1 union 1:1; 임의 추가 금지, spec + PO 선행.
- `track.ts` union ↔ zod parity 강제(`schema-union-parity.spec.ts` 확장).
- 이벤트 payload에 사진/일기 본문 미포함(메타만).

## Non-goals

- 자동검증 판정 로직 — WP2b/EVAL-0022(결과 기록·알림만).
- 피어 반려 저장·집계 — WP5/EVAL-0025(반려율 소비만).
- 임계값 θ 결정(G1·외부); 반려율 임계와 운영 알림 임계는 별개.

## Acceptance Criteria

| 기준                           | 검증 방법                             |
| ------------------------------ | ------------------------------------- |
| 임계 초과 알림 AC-owner-load-3 | 픽스처 → 그룹 알림 트리거             |
| 이벤트 union 1:1               | PRD §9.1 표와 1:1(spec 대조)          |
| union ↔ zod parity             | schema-union-parity.spec.ts 확장 통과 |
| 본문 미로깅                    | payload 사진/일기 본문 부재 확인      |
| spec 선행                      | `docs/superpowers/specs/` spec + PO   |
| harness traceability           | `pnpm harness:check` 통과             |

## Verification Commands

```bash
# blocked: AnalyticsEvent union spec + PO 승인 선행. 해제 후:
pnpm harness:context EVAL-0026
pnpm typecheck && pnpm lint
pnpm test -- analytics     # union ↔ zod parity + 알림 임계 트리거
pnpm harness:check
```

## Expected Output Summary

선행 spec 위치, `failed`·반려율 임계 알림, union ↔ zod parity, 본문 미로깅, EVAL-0022·0025 의존을 한국어로 요약.

## Harness Impact Questions

1. New folder structure? No — 기존 `lib/analytics/`·알림 경로.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 갱신? spec 확정 시 가드레일 갱신 → `evals/drift-reports/` 노트.

## Stop Condition

- union spec + PO 승인 선행 후 모든 AC green + `pnpm harness:check` 통과.
- blocked 동안: spec 초안·알림 임계 테스트 가능, union 추가·활성은 spec 확정 후.
- pass@3 미달 → 알림/이벤트 union split(05 §9.4).
