# Workflow: check-harness-drift

## Goal
7개 drift 유형을 점검해 읽기전용 drift report 생성(해소 아님 — 깃발만, 원칙 7).

## Read First
- .agents/harness/DRIFT_CHECKLIST.md · harness/config/harness.config.json · 05 §7

## Inputs
- 시점: Define-time | Record-time | 주기 sweep
- 변경 diff(Record-time) 또는 전체 그래프(sweep)

## Process — 7 drift 유형
1. Architecture Drift — 레이어/경계 위반(feature가 expo-* 직접 import 등)
2. Rule Drift — .claude/rules ↔ 코드 괴리
3. Task Granularity Drift — pass@3 반복 실패 누적
4. Verification Drift — 보존 eval red 뒤집힘 / 게이트 우회
5. Product Drift — 코드 ↔ PRD 의도 괴리 → [HUMAN REVIEW]
6. Dependency Drift — expo/pkg 표준 이탈
7. Traceability Drift — 인용 경로/AC 소멸(hallucinated-path)

결정론 floor 우선(Tier 1): validate:docs · 인용 resolve · 보존 eval · AnalyticsEvent parity.
모델 보조(Tier 2)는 sweep에서만 [HUMAN REVIEW] 플래그.

## Output Format
evals/drift-reports/<date>.md (append-only).
각 항목: {유형, Tier, Level(UPDATE_POLICY), 위치, 제안}.

## Stop Condition
- 모든 유형 점검 완료. 결정론 불일치 0 또는 전부 report됨. 명령: pnpm harness:drift.
