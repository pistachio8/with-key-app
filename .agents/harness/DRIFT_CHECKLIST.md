# Drift Checklist (7 유형)

> check-harness-drift의 Process가 읽는 점검표. 7 유형 × {시점 · Tier · 결정론 체크}. (05 §7)

| # | drift 유형 | 시점 | Tier | 결정론/모델 체크 |
|---|---|---|---|---|
| 1 | Architecture | Record / sweep | 2 | feature가 `expo-*` 직접 import 여부 grep |
| 2 | Rule | sweep | 2 | `.claude/rules` ↔ 코드 괴리 → [HUMAN REVIEW] |
| 3 | Task Granularity | Record | 1 | pass@3 반복 실패 누적 카운트 |
| 4 | Verification | Record | 1 | 보존 eval red 뒤집힘 · 게이트 우회 |
| 5 | Product | sweep | 2 | 코드 ↔ PRD 의도 괴리 → [HUMAN REVIEW] |
| 6 | Dependency | Record | 1 | expo/pkg 표준 이탈 |
| 7 | Traceability | Define / Record | 1 | 인용 경로/AC resolve (hallucinated-path) |

결정론 floor(Tier 1) 우선: `validate:docs` · 인용 resolve · 보존 eval · AnalyticsEvent parity.
Tier 2 모델 보조는 주기 sweep에서만 [HUMAN REVIEW] 플래그.

읽는 workflow: check-harness-drift.
업데이트 시점: drift 기준 변경 (Level 2).
