---
Task: EVAL-0025
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: reaction 저장 모델 spec 선행 — 🟨 익명 반려 = Kudos union 변경(PRD §9.1 1:1) → PO 승인 + 별도 spec(ADR-0032 §게이트·범위 경계, 둘 다 미작성). 선행 EVAL-0020(컬럼).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0025: 🟨 피어 반려 + 그룹장 검토 대체 — 익명 다수결로 맥락적 사기 거름

> WP5 (`feat/rn-peer-reject`). **spec blocked** — 익명 반려 reaction 저장이 Kudos union을 바꾸므로 PO 승인 + spec 선행(ES §게이트). θ 무관. 그룹장 단독 검토를 다수결이 대체.

## Parent Links

- PRD: `AC-peer-reject-1·2·3·4`, `AC-owner-load-1·2` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- TS: SoT 없음 — AT eval 흡수(05 §2 D10). raw: [raw-job-stories](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- JS: `JS-verify-5·6` — [p2-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Eng: [photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP5
- WP: `feat/rn-peer-reject` (WP5)

## Goal

기계가 못 잡는 맥락적 사기를 그룹이 익명으로 거르고, 그룹장 단독 판정 이해상충을 없앤다. 🟨 1탭(Kudos 별개, 익명), 과반 → `peer_rejected`(`doneCount` 제외). 과반 미달 → `passed`, 정산 전 48h. 자기 반려 불가, 그룹장 1표(다수결이 `manual_review` 대체).

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md` (§게이트)
- `docs/eng-stories/2026-06-05-photo-verification.md`
- `packages/domain/src/validators/kudos.ts`
- `apps/web/src/lib/db/reads/kudos-viewer.ts` · `kudos-counts.ts`
- `supabase/migrations/0033_notification_prefs_kudos.sql` · `0034_kudos_push_log.sql`
- `apps/web/src/lib/db/reads/action-log-hydrate.ts` (반려 집계, ADR-0024 Layer1 이후)

## Target Files

- `docs/superpowers/specs/` — **선행 spec**: reaction 저장 모델 + 익명 집계 경계
- `supabase/migrations/` — 반려 reaction 저장 + `peer_rejected` 집계
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

| 기준                                    | 검증 방법                                       |
| --------------------------------------- | ----------------------------------------------- |
| 익명 별개 reaction (`AC-peer-reject-1`) | 카운트만 노출, Kudos 분리                       |
| 본인 제외 과반 (`AC-peer-reject-2`)     | > (N−1)/2 → `peer_rejected`, 본인 반려 거부     |
| 토글·복원·48h (`AC-peer-reject-3`)      | 과반 미달 → `passed`, 마감+48h 이후 무효        |
| 그룹장 대체·1표 (`AC-peer-reject-4`)    | `manual_review` 부재, 1표 한도                  |
| spec 선행                               | `docs/superpowers/specs/`에 spec + PO 승인 존재 |
| harness traceability                    | `pnpm harness:check` 통과                       |

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

선행 spec 위치, 🟨 1탭·익명 집계, 과반 임계·토글·48h, 그룹장 1표·검토 대체, ADR-0024 hydrate 경계를 한국어로 요약한다.

## Harness Impact Questions

1. 폴더? No. 2. 명명? 반려 reaction 테이블/태그 신규 가능(yes) → drift. 3. 의존? No. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? Kudos union spec 확정 시 가드레일 인용 갱신(yes 가능) → `evals/drift-reports/`.

## Stop Condition

- reaction 저장 spec + PO 승인 선행 후 모든 AC green + `pnpm harness:check` 통과.
- blocked 동안: spec 초안·과반 임계 테스트 작성 가능, 저장 모델·UI 활성은 spec 확정 후.
- pass@3 미달 → 저장 / 집계 / UI split(05 §9.4).
