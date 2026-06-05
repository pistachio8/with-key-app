---
Task: EVAL-0025
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: reaction 저장 모델 spec 선행 — 🟨 익명 반려 = Kudos union 변경(PRD §9.1 1:1) → PO 승인 + 별도 spec(ADR-0032 §게이트·범위 경계, 둘 다 미작성). 선행 EVAL-0020(컬럼).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0025: 🟨 피어 반려 + 그룹장 검토 대체 — 익명 다수결로 맥락적 사기 거름

> Work Package WP5 (`feat/rn-peer-reject`). **spec blocked** — 익명 반려 reaction 저장이 Kudos union을 바꾸므로 PO 승인 + 별도 spec 선행(ES §게이트). θ와 무관(피어 다수결은 기계 신호와 상호보완). 그룹장 단독 검토를 다수결이 대체.

## Parent Links

- Parent PRD Feature: `AC-peer-reject-1`(🟨 1탭, Kudos와 별개·익명 집계) · `AC-peer-reject-2`(본인 제외 과반 → `failed`, 본인 반려 불가) · `AC-peer-reject-3`(토글·과반 미달 복원, 정산 전 48h 유효) · `AC-peer-reject-4`(그룹장 수동검토·`manual_review` 대체, Q8) · `AC-owner-load-1`(그룹장 전용 검토 없음) · `AC-owner-load-2`(그룹장 1표) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-5`(그룹이 함께·익명으로 거른다) · `JS-verify-6`(그룹장 단독 판정 안 해도 된다) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP5
- Parent Work Package: `feat/rn-peer-reject` (WP5)

## Goal

기계가 못 잡는 맥락적 사기를 그룹이 익명으로 거르고, 그룹장 단독 판정의 이해상충을 없앤다. 이 task가 끝나면 인증 카드에 **🟨 반려 1탭**(Kudos와 별개, 익명 집계 — 누가 눌렀는지 숨김)이 있고, **본인 제외 참가자 과반**(> (N−1)/2)이면 해당 인증이 `peer_rejected`(`doneCount` 제외)로 바뀌며, 토글로 과반 미달 시 `passed` 복원되고, 유효기간은 정산 전(마감 후 48h)까지이며, 본인은 자기 인증을 반려할 수 없고, 그룹장도 일반 참가자로서 **1표만** 가져 전용 검토 권한이 없다(다수결이 `manual_review`·그룹장 검토를 대체).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§게이트·범위 경계 — reaction 저장 = Kudos union 변경)
- `docs/eng-stories/2026-06-05-photo-verification.md` (WP5)
- `apps/web/src/lib/validators/kudos.ts` (Kudos union — 변경 대상, spec 선행)
- `apps/web/src/lib/db/reads/kudos-viewer.ts` · `kudos-counts.ts` (viewer-specific cache 패턴)
- `supabase/migrations/0033_notification_prefs_kudos.sql` · `0034_kudos_push_log.sql`
- `apps/web/src/lib/db/reads/action-log-hydrate.ts` (피드 hydrate — 반려 집계 노출 경로, ADR-0024 Layer1 이후)

## Target Files

- `docs/superpowers/specs/` — **선행 spec**: 🟨 반려 reaction 저장 모델(Kudos union 변경) + 익명성·집계 경계 (PO 승인 기록)
- `supabase/migrations/` — 신규 반려 reaction 저장 + 과반 → `peer_rejected` 집계 (spec 확정 후)
- `apps/web/src/lib/validators/` · `apps/web/src/app/(app)/challenge/` — 🟨 1탭 UI·집계 read

## Requirements

- 🟨 반려는 Kudos와 **별개 reaction** — 익명 집계(카운트만, 누가 눌렀는지 숨김) (`AC-peer-reject-1`).
- 본인 제외 과반(> (N−1)/2) → `peer_rejected`(카운트 제외), 본인은 자기 인증 반려 불가 (`AC-peer-reject-2`).
- 토글 가능 · 과반 미달로 떨어지면 `passed` 복원 · 유효기간 정산 전(마감 후 48h) (`AC-peer-reject-3`).
- 다수결이 그룹장 수동검토·`manual_review` 대체 (`AC-peer-reject-4`·`AC-owner-load-1`), 그룹장 1표·전용 권한 없음 (`AC-owner-load-2`).
- 반려 집계의 피드 노출은 ADR-0024 Layer1(visibility) 이후 hydrate read 경계 준수.

## Non-goals

- 자동 부정탐지 신호·판정 — WP2/EVAL-0021·0022 (상호보완, 본 task는 맥락 다수결).
- 운영 알림·반려율 AnalyticsEvent — WP6/EVAL-0026.
- 48h 정산 마감 트리거 자체 — P1 정산(EVAL-0008)이 48h 이의 마감에 의존(역방향 인용).

## Acceptance Criteria

| 기준                                                     | 검증 방법                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| 익명 별개 reaction (`AC-peer-reject-1`)                  | 🟨 카운트만 노출·누가 눌렀는지 미노출, Kudos와 분리                |
| 본인 제외 과반 (`AC-peer-reject-2`)                      | N명 픽스처: > (N−1)/2 반려 → `peer_rejected`, 본인 반려 거부       |
| 토글·복원·48h (`AC-peer-reject-3`)                       | 과반 미달 → `passed` 복원, 마감+48h 이후 무효                      |
| 그룹장 대체·1표 (`AC-peer-reject-4`·`AC-owner-load-1,2`) | `manual_review` 전용 검토 부재, 그룹장 1표 한도                    |
| spec 선행                                                | `docs/superpowers/specs/`에 reaction 저장 spec + PO 승인 기록 존재 |
| harness traceability                                     | `pnpm harness:check` 통과                                          |

## Verification Commands

```bash
# blocked: reaction 저장 spec + PO 승인 선행. 해제 후:
pnpm harness:context EVAL-0025
pnpm typecheck && pnpm lint
pnpm test -- peer-reject   # 과반 임계·토글·48h·본인 반려 불가
pnpm harness:check
# CI: 반려 집계 RLS·익명성 역할 테스트 / 모바일 viewport 수동 확인
```

## Expected Output Summary

선행 spec(reaction 저장·익명 경계·PO 승인) 위치, 🟨 1탭·익명 집계 구현, 본인 제외 과반 임계·토글·48h, 그룹장 1표·검토 대체, ADR-0024 hydrate 경계 준수를 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — 기존 `validators/`·`db/reads/`·route colocation.
2. New naming convention? 반려 reaction 테이블/태그 신규 명명 가능 — yes일 수 있음. → drift 노트.
3. New dependency? No.
4. Verification commands changed? No — `pnpm test -- peer-reject` 스코프뿐.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? Kudos union 변경 spec 확정 시 가드레일(AnalyticsEvent/Kudos) 인용 갱신 검토 → yes 가능, `evals/drift-reports/` 노트.

## Stop Condition

- **reaction 저장 spec + PO 승인 선행 후** 모든 Acceptance Criteria green + `pnpm harness:check` 통과.
- blocked 동안: spec 초안·과반 임계 로직 테스트 *작성*까지 가능, 저장 모델·UI 활성은 spec 확정 후.
- pass@3 안에 green 못 만들면 → 반려 저장 / 과반 집계 / UI로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
