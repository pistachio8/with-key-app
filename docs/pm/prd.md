---
prd: 2026-06-05-p1-settlement
title: P1 포인트 보증금 정산 — Normalized PRD (greenfield)
author: pistachio8
date: 2026-06-05
status: draft
---

# Normalized PRD: P1 포인트 보증금 정산 (greenfield)

> PM_PLUGIN_ADAPTER §출력(normalized) 의 `docs/pm/prd.md`. **본문 SoT 아님** — greenfield PRD 본문은 [`docs/migration/01-rn-mvp-prd.md`](../migration/01-rn-mvp-prd.md) §5.C·§5.D 가 진실이고, 이 파일은 backlog pipeline(create-test-scenarios → create-job-stories → create-engineering-stories)이 읽는 **AC id 인덱스 + Track/게이트 슬롯**이다(ADR-0031 §1: 인용·요약만, 복제 금지).

- **Source**: docs/migration/01-rn-mvp-prd.md §5.C (Plugin Mode normalize 2026-06-05)
- **Track**: greenfield (보존 baseline 없음 — POC "표시만" penalty 를 실제 포인트 이동으로 신규 구축)
- **데이터 모델 ADR**: [ADR-0032](../adr/0032-settlement-verification-data-model.md) (point_ledger · settlements · immutability 예외)
- **하위 산출물**: [job-stories](./job-stories.md) · [test-scenarios](./test-scenarios.md) · [acceptance-criteria](./acceptance-criteria.md) · [risks-assumptions](./risks-assumptions.md)

## AC id 인덱스 (PRD §5.C 미러 — 측정 가능 기준의 SoT는 PRD)

| Feature (AC prefix)   | AC ids               | 한 줄 요약                                                                                                    |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `AC-deposit-hold-*`   | deposit-hold-1 … 5   | 서약 시 최대 누적 벌금 hold, 잔액부족 차단, 신규 초기 그랜트, 공동풀 균등 차감, append-only 원장(잔액=Σdelta) |
| `AC-deposit-gauge-*`  | deposit-gauge-1 … 3  | 진행 중 차감 예정액 게이지, 실제 이동 고지, 잔액 조회                                                         |
| `AC-settle-*`         | settle-1 … 7         | 달성자 환급 + 미달분 그룹 공동주머니 이월(개인 재분배 없음), 주 단위 누적, 정산 스냅샷                        |
| `AC-settle-trigger-*` | settle-trigger-1 … 4 | 그룹장 "정산 확정" 1회 + 72h auto-settle, 48h 이의 마감, 이중정산 idempotency                                 |
| `AC-points-use-*`     | points-use-1 … 3     | 현금화 불가 closed-loop, 다음 보증금/구독 할인 사용, 잔액·이력 조회                                           |

## Track · 의존 · 게이트 (PRD §5.D 미러 — create-agent-tasks 입력)

| Feature               | Track      | depends-on                                       | blocked-by        |
| --------------------- | ---------- | ------------------------------------------------ | ----------------- |
| `AC-deposit-hold-*`   | greenfield | A1 서약, weekly-penalty-accrual spec             | **G2** (법무, Q2) |
| `AC-deposit-gauge-*`  | greenfield | `AC-deposit-hold-*`                              | **G2**            |
| `AC-settle-*`         | greenfield | `AC-deposit-hold-*`, weekly-penalty-accrual      | **G2**            |
| `AC-settle-trigger-*` | greenfield | `AC-settle-*`, `AC-peer-reject-*` (48h 마감, P2) | **G2**            |
| `AC-points-use-*`     | greenfield | `AC-settle-*`                                    | **G2**            |

> **즉시 활성(게이트 무관)**: 결정론 불변식 `AC-deposit-hold-5`(잔액=Σdelta) · `AC-settle-trigger-3`(idempotency) 은 G2 전에도 테스트 가능(05 §3, ADR-0032).

## 용어집

- **greenfield Track**: 포팅 baseline 없이 신규 구축하는 기능(POC "표시만" → 실제 포인트 이동).
- **G2**: ⓑ적립 포인트 법무 검토 게이트(환불·사행성·선불전자지급수단 리스크 ≈0 확인). P1 전 기능의 blocked-by.
