# Harness Maintenance (자기유지 개요·인덱스)

> 하네스가 스스로를 outdated 상태에서 지키는 흐름의 인덱스. self-maintaining ≠ self-directing(원칙 8) — 깃발만 꽂고, 해소는 사람이 한다.

## 자기유지 흐름

Development Progress → Task Summary(`pnpm harness:summarize-diff`) → Harness Impact Check(Agent Task 6 질문) → Drift Detection(`pnpm harness:drift`) → Drift Report(`evals/drift-reports/`) → Update Proposal(propose-harness-update) → Human Review(review-harness-update) → Update Task(apply-harness-update) → Changelog(`CHANGELOG.md`). 작업 전 컨텍스트 수집은 `pnpm harness:context`.

## 인덱스

- 권한 경계 3단 + meta-eval: `UPDATE_POLICY.md`
- 7 drift 유형 점검표: `DRIFT_CHECKLIST.md`
- PO 대기 결정 로그: `DECISION_NEEDED.md`
- 변경 이력: `CHANGELOG.md`
- 설정 예시: `config/harness.config.example.json`
- 워크플로: `workflows/check-harness-drift.md` · `workflows/propose-harness-update.md` · `workflows/review-harness-update.md` · `workflows/apply-harness-update.md`

읽는 workflow: check-harness-drift.
업데이트 시점: 자기유지 구조 변경 (Level 2).
