---
Task: EVAL-0026
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: 신규 AnalyticsEvent spec 선행 — 자동검증·반려 이벤트는 PRD §9.1 union 1:1 spec + PO 승인(가드레일 §AnalyticsEvent). 선행 EVAL-0022(판정)·EVAL-0025(반려) 산출.
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0026: 운영 알림 + AnalyticsEvent — failed·반려율 임계 초과 시 그룹 알림 + 검증 이벤트

> Work Package WP6 (`feat/rn-verify-ops`). **spec blocked** — 자동검증·반려 신규 이벤트는 PRD §9.1 union과 1:1 spec 선행(ES §게이트). WP5(EVAL-0025) → WP6 의존. 알림 자체는 θ 무관이나 이벤트 union 변경이 spec 게이트.

## Parent Links

- Parent PRD Feature: `AC-owner-load-3`(`failed`·반려율이 임계 이상이면 그룹에 알림 — 부정탐지 오작동·갈등 신호) + 자동검증·반려 AnalyticsEvent (PRD §9.1 union 1:1) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-6`(그룹장은 일일이 확인·단독 판정 안 해도 된다) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP6
- Parent Work Package: `feat/rn-verify-ops` (WP6)

## Goal

부정탐지 오작동·그룹 갈등을 운영이 일찍 감지하고, 검증 흐름을 분석 가능하게 한다. 이 task가 끝나면 `failed`·반려율이 임계 이상일 때 그룹에 알림이 가고(`AC-owner-load-3`), 자동검증 결과·피어 반려 흐름이 **PRD §9.1 union과 1:1로 정의된 AnalyticsEvent**로 기록되며(임의 이벤트 추가 금지, spec 선행), `track.ts` union ↔ zod parity가 테스트로 강제된다.

## Source Files to Inspect

- `docs/eng-stories/2026-06-05-photo-verification.md` (WP6)
- `docs/PRD.md` §9.1 (AnalyticsEvent 이벤트 표 — union SoT)
- `apps/web/src/lib/analytics/track.ts` · `track.spec.ts` (이벤트 union — 변경 대상)
- `apps/web/src/lib/analytics/schema.ts` · `schema-union-parity.spec.ts` (zod ↔ TS parity)
- `supabase/migrations/0040_all_signed_owner_nudge.sql` (기존 그룹 알림 패턴)

## Target Files

- `docs/superpowers/specs/` — **선행 spec**: 자동검증·반려 AnalyticsEvent 정의(PRD §9.1 union 1:1, PO 승인)
- `apps/web/src/lib/analytics/track.ts` · `schema.ts` — 이벤트 union·zod 추가 (spec 확정 후)
- `apps/web/src/app/(app)/` 또는 알림 경로 — `failed`·반려율 임계 그룹 알림

## Requirements

- `failed`·반려율이 임계 이상이면 그룹 알림 (`AC-owner-load-3`) — 기존 알림 패턴(`owner_nudge` 등) 재사용.
- 자동검증·반려 이벤트는 **PRD §9.1 union과 1:1** — 임의 이벤트 추가 금지, spec + PO 선행(가드레일 §AnalyticsEvent).
- `track.ts` TS union ↔ zod schema parity 테스트 강제(기존 `schema-union-parity.spec.ts` 확장).
- 이벤트 본문에 사진/일기 본문 미포함 — 메타만.

## Non-goals

- 자동검증 판정 로직 — WP2b/EVAL-0022 (본 task는 결과를 _기록·알림_).
- 피어 반려 저장·집계 — WP5/EVAL-0025 (본 task는 반려율을 _소비_).
- 임계값 θ 결정 — G1(외부). 본 task의 "반려율 임계"는 운영 알림 임계(별개).

## Acceptance Criteria

| 기준                                    | 검증 방법                                                      |
| --------------------------------------- | -------------------------------------------------------------- |
| 임계 초과 그룹 알림 (`AC-owner-load-3`) | `failed`/반려율 임계 픽스처 → 그룹 알림 트리거                 |
| 이벤트 union 1:1                        | 신규 이벤트가 PRD §9.1 표와 1:1 (spec 대조)                    |
| union ↔ zod parity                      | `schema-union-parity.spec.ts` 확장 통과                        |
| 본문 미로깅                             | 이벤트 payload에 사진/일기 본문 부재 코드 대조                 |
| spec 선행                               | `docs/superpowers/specs/`에 AnalyticsEvent spec + PO 승인 존재 |
| harness traceability                    | `pnpm harness:check` 통과                                      |

## Verification Commands

```bash
# blocked: AnalyticsEvent union spec + PO 승인 선행. 해제 후:
pnpm harness:context EVAL-0026
pnpm typecheck && pnpm lint
pnpm test -- analytics     # union ↔ zod parity + 알림 임계 트리거
pnpm harness:check
```

## Expected Output Summary

선행 spec(AnalyticsEvent union·PO 승인) 위치, `failed`·반려율 임계 그룹 알림 구현, track.ts union ↔ zod parity 강제, 본문 미로깅, EVAL-0022·0025 의존을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — 기존 `lib/analytics/`·알림 경로.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No — `pnpm test -- analytics` 스코프뿐.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? AnalyticsEvent union 변경은 spec-required 경로(§4) — spec 확정 시 가드레일 인용 갱신 검토 → yes 가능, `evals/drift-reports/` 노트.

## Stop Condition

- **AnalyticsEvent union spec + PO 승인 선행 후** 모든 Acceptance Criteria green + `pnpm harness:check` 통과.
- blocked 동안: spec 초안·알림 임계 로직 테스트 *작성*까지 가능, 이벤트 union 추가·활성은 spec 확정 후.
- pass@3 안에 green 못 만들면 → 알림 / 이벤트 union으로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
