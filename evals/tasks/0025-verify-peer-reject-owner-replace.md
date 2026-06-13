---
Task: EVAL-0025
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0020] — EVAL-0020(검증 status 컬럼 0045) 구현 선행, intra-feature 순서(게이트 아님). ADR-0038 accepted + PO 승인(2026-06-14)으로 reaction 저장 게이트 해소.
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0025: 🟨 피어 반려 + 그룹장 검토 대체 — 익명 다수결로 맥락적 사기 거름

> WP5 (`feat/rn-peer-reject`). 익명 반려 reaction 저장 게이트 해소 — ADR-0038 accepted + PO 승인(2026-06-14), 착수 가능. θ 무관. 그룹장 단독 검토를 다수결이 대체.

## Parent Links

- PRD: `AC-peer-reject-1·2·3·4`, `AC-owner-load-1·2` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- TS: SoT 없음 — AT eval 흡수(05 §2 D10). raw: [raw-job-stories](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- JS: `JS-verify-5·6` — [p2-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Eng: [photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP5
- WP: `feat/rn-peer-reject` (WP5)

## Goal

기계가 못 잡는 맥락적 사기를 그룹이 익명으로 거르고, 그룹장 단독 판정 이해상충을 없앤다. 🟨 1탭(Kudos 별개, 익명), 과반 → `peer_rejected`(`doneCount` 제외). 과반 미달 → `passed`, 정산 전 48h. 자기 반려 불가, 그룹장 1표(다수결이 `manual_review` 대체).

## Source Files to Inspect

- `docs/adr/0038-reaction-storage-model.md` (reaction 저장 결정 — 본 task 선행 ADR)
- `docs/adr/0032-settlement-verification-data-model.md` (§게이트)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `packages/domain/src/validators/kudos.ts`
- `apps/web/src/lib/db/reads/kudos-viewer.ts` · `kudos-counts.ts`
- `supabase/migrations/0033_notification_prefs_kudos.sql` · `0034_kudos_push_log.sql`
- `apps/web/src/lib/db/reads/action-log-hydrate.ts` (반려 집계, ADR-0024 Layer1 이후)

## Target Files

- 선행 결정: `docs/adr/0038-reaction-storage-model.md` — reaction 저장 모델 + 익명 집계 경계(테이블·RLS·RPC·분모 N·48h·전이). accepted + PO 승인이 차단 해제 조건.
- `supabase/migrations/` — 반려 reaction 저장 + `peer_rejected` 집계 (ADR-0038 §1·§3 구현)
- `packages/domain/src/validators/` · `apps/web/src/app/(app)/challenge/` — 🟨 1탭 UI·집계 read

## Requirements

- 🟨 반려: Kudos 별개 reaction, 익명 집계(카운트만) (`AC-peer-reject-1`).
- 본인 제외 과반(> (N−1)/2) → `peer_rejected`, 본인 반려 불가 (`AC-peer-reject-2`).
- 토글·과반 미달 → `passed`, 정산 전 48h (`AC-peer-reject-3`).
- 다수결이 `manual_review` 대체, 그룹장 1표·전용 권한 없음 (`AC-peer-reject-4`·`AC-owner-load-1`·`AC-owner-load-2`).
- 반려 집계 피드 노출: ADR-0024 Layer1 이후 hydrate read 경계.

## Non-goals

자동 부정탐지 신호·판정(WP2/EVAL-0021·0022) / 운영 알림·반려율 AnalyticsEvent(WP6/EVAL-0026) / 48h 정산 마감 트리거(P1 정산 EVAL-0008 의존, 역방향).

## Acceptance Criteria

| 기준                                    | 검증 방법                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| 익명 별개 reaction (`AC-peer-reject-1`) | 카운트만 노출, Kudos 분리                                                              |
| 본인 제외 과반 (`AC-peer-reject-2`)     | > (N−1)/2 → `peer_rejected`, 본인 반려 거부                                            |
| 토글·복원·48h (`AC-peer-reject-3`)      | 과반 미달 → `passed`, 마감+48h 이후 무효                                               |
| 그룹장 대체·1표 (`AC-peer-reject-4`)    | `manual_review` 부재, 1표 한도                                                         |
| ADR 선행                                | [ADR-0038](../../docs/adr/0038-reaction-storage-model.md) `Status: accepted` + PO 승인 |
| harness traceability                    | `pnpm harness:check` 통과                                                              |

## Verification Commands

```bash
# blocked: ADR-0038 accepted + PO 승인 선행. 해제 후:
pnpm harness:context EVAL-0025
pnpm typecheck && pnpm lint
pnpm test -- peer-reject   # 과반 임계·토글·48h·본인 반려 불가
pnpm harness:check
# CI: 반려 집계 RLS·익명성 역할 테스트 / 모바일 viewport 수동 확인
```

## Expected Output Summary

선행 ADR(0038) 결정 요약, 🟨 1탭·익명 집계, 과반 임계·토글·48h, 그룹장 1표·검토 대체, ADR-0024 hydrate 경계를 한국어로 요약한다.

## Harness Impact Questions

1. 폴더? No. 2. 명명? 반려 reaction 테이블/태그 신규 가능(yes) → drift. 3. 의존? No. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? Kudos union ADR(0038) 확정 시 가드레일 인용 갱신(yes 가능) → `evals/drift-reports/`.

## Stop Condition

- ADR-0038 accepted + PO 승인 선행 후 모든 AC green + `pnpm harness:check` 통과.
- blocked 동안: 과반 임계 테스트 작성 가능, 저장 모델·UI 활성은 ADR-0038 accepted 후.
- pass@3 미달 → 저장 / 집계 / UI split(05 §9.4).
