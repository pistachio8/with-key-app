---
eng-story: 2026-06-05-points-settlement
title: P1 포인트 보증금 정산 데이터·정산 파이프라인
author: pistachio8
date: 2026-06-05
status: draft
---

# Engineering Story: P1 포인트 보증금 정산 데이터·정산 파이프라인

> "달성자 환급·미달분 공동주머니 이월(결과)을 위해 시스템은 append-only 포인트 원장 + 불변 정산 스냅샷 + SECURITY DEFINER 정산 RPC(기술 변경)를 가져야 한다, 금전 정합·감사·이중정산 방지(제약) 때문에." 시스템 언어. 1 ES → N Work Package(05 §1.2).

## Parent / 직교 인용

- 상위 Job Story: [JS-settle-1 … 5](../pm/job-stories.md)
- 상위 PRD AC: `AC-deposit-hold-*` · `AC-deposit-gauge-*` · `AC-settle-*` · `AC-settle-trigger-*` · `AC-points-use-*` ([PRD §5.C](../migration/01-rn-mvp-prd.md))
- 직교 결정(인용만 — 본문 복제 아님):
  - 데이터 모델: [ADR-0032 정산·자동검증 데이터 모델](../adr/0032-settlement-verification-data-model.md) (point_ledger · settlements · 가드 트리거)
  - 정산 cutoff: [ADR-0030 조기 종료 정산 cutoff](../adr/0030-early-close-settlement-cutoff.md) (`challenges.closed_at`)
  - 미달분 계산: spec [weekly-penalty-accrual](../superpowers/specs/2026-06-02-weekly-penalty-accrual.md) (`confirmedPenalty`)
  - 수용기준·검증: [acceptance-criteria](../pm/acceptance-criteria.md) · [test-scenarios](../pm/test-scenarios.md)
  - 리스크·게이트: [risks-assumptions](../pm/risks-assumptions.md)

## 서사 (지을 일 + 엔지니어링 왜)

POC의 "표시만" penalty 를 실제 포인트 이동으로 만들려면, 금전성 데이터를 **감사·분쟁 추적 가능한 append-only 원장**(`point_ledger`, 잔액=Σdelta)과 **불변 정산 스냅샷**(`settlements`, PK=challenge_id)으로 적재하고, 모든 쓰기를 `SECURITY DEFINER` RPC 한 경로로 닫아야 한다(RLS read=self+그룹, write=RPC만). 미달분 산정은 binary 가 아니라 주 단위 누적(`confirmedPenalty`)을 따르고, 조기 종료는 `closed_at` cutoff(ADR-0030)와 정합해야 한다. 정산은 그룹장 1회 확정 또는 마감 후 72h auto-settle 으로 트리거되며, **이중 정산은 `settlements` PK + ON CONFLICT no-op 로 결정론적으로 차단**한다.

**게이트 경계**: 데이터·RPC 의 _결정론 불변식_(잔액=Σdelta `AC-deposit-hold-5`, idempotency `AC-settle-trigger-3`)은 G2 와 무관하게 즉시 구현·테스트(05 §3). production migration apply 와 사용자향 hold/정산 노출은 **G2(법무) 통과 후**.

## Work Packages (spawn)

- **WP1 — 데이터 레이어 migration** (`supabase/migrations/0042+`): `point_ledger` · `settlements` · `challenge_participants.deposit_points` + RLS(self/그룹 read, RPC-only write) + 가드 트리거. ADR-0032 구현. Track 불변식 테스트 동반. _gate: 설계·로컬 검증 무관 / apply는 G2._
- **WP2 — 정산 RPC + 잔액 read** (`SECURITY DEFINER`): `grant_bundle_points` · `hold_deposit` · `deposit_release` · `settle_challenge`(idempotent) · `distribute_pool` + 잔액=Σdelta 조회. 결정론 불변식(idempotency·Σdelta) 단위 테스트. _gate: 즉시._
- **WP3 — 보증금 hold·게이지 UI/read**: 서약 시 hold(잔액부족 차단·신규 그랜트·공동풀 균등), 진행 중 차감 예정액 게이지. `AC-deposit-hold-*`·`AC-deposit-gauge-*`. _gate: G2._
- **WP4 — 정산 트리거 + auto-settle cron**: 그룹장 "정산 확정" + 마감 후 72h cron, 48h 이의 마감(peer-reject P2) 연동, 이중정산 방지. `AC-settle-*`·`AC-settle-trigger-*`. _gate: G2 + P2 peer-reject 의존._
- **WP5 — 포인트 사용·잔액 화면 + AnalyticsEvent**: 다음 보증금/구독 할인 사용, 잔액·이력 화면, `settlement_triggered`·`settlement_auto`·`points_balance_view` 이벤트. `AC-points-use-*`. _gate: G2 · 이벤트는 PRD §9.1 union 1:1 spec 선행._

> 의존 순서: WP1 → WP2 → (WP3 ∥ WP4) → WP5. WP1·WP2 는 게이트 무관(불변식), WP3~5 는 G2 blocked.

## Track

- **greenfield** (보존 baseline 없음 — POC "표시만"을 실데이터 정산으로 신규 구축, D2).
