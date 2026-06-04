# Workflow: check-harness-drift

## Goal

7개 drift 유형을 점검해 읽기전용 drift report 생성(해소 아님 — 깃발만, 원칙 7).

## Read First

- .agents/harness/DRIFT_CHECKLIST.md · harness/config/harness.config.json · 05 §7

## Inputs

- 시점: Define-time | Record-time | 주기 sweep
- 변경 diff(Record-time) 또는 전체 그래프(sweep)

## Process — 7 drift 유형

1. Architecture Drift — 레이어/경계 위반(feature가 expo-\* 직접 import 등)
2. Rule Drift — .claude/rules ↔ 코드 괴리
3. Task Granularity Drift — pass@3 반복 실패 누적
4. Verification Drift — 보존 eval red 뒤집힘 / 게이트 우회
5. Product Drift — 코드 ↔ PRD 의도 괴리 → [HUMAN REVIEW]
6. Dependency Drift — expo/pkg 표준 이탈
7. Traceability Drift — 인용 경로/AC 소멸(hallucinated-path)

결정론 floor 우선(Tier 1): validate:docs · 인용 resolve · 보존 eval · AnalyticsEvent parity.
모델 보조(Tier 2)는 sweep에서만 [HUMAN REVIEW] 플래그.

분류 축(어떤 산출물을 고치나): Case A(코드가 규칙 위반 → 코드 수정 task) · Case B(규칙↔현실 괴리 → Level 1/2 harness proposal) · Case C(제품 결정 변경 → Level 3 DECISION_NEEDED). Level 매핑·승인 게이트는 UPDATE_POLICY(자율/승인 축).

## Output Format

evals/drift-reports/<date>.md (append-only).
각 항목: {유형, Tier, Level(UPDATE_POLICY), Case, 위치, evidence, 제안}.
추가 섹션: Orphan Tasks(parent link 깨진 Agent Task) · Missing Harness Files(있어야 하나 없는 하네스 문서).

## Stop Condition

- 모든 유형 점검 완료. 결정론 불일치 0 또는 전부 report됨. 명령: pnpm harness:drift.
