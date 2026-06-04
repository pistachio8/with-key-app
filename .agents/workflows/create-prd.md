# Workflow: create-prd

## Goal

제품 맥락 → 표준 PRD(측정 가능한 AC 포함) 생성/정규화.

## Read First

- .agents/pm/PRODUCT_CONTEXT.md · .agents/pm/PM_PLUGIN_ADAPTER.md · .agents/pm/templates/PRD_TEMPLATE.md

## Inputs

- Plugin Mode: .agents/pm/raw/ 의 raw PRD / Native Mode: PRODUCT_CONTEXT + 템플릿
- port 트랙: 기존 docs/PRD.md · docs/migration/01 인용(새 PRD 불필요)

## Process

1. raw 있으면 PM_PLUGIN_ADAPTER normalize 규칙 적용, 없으면 템플릿 직접 작성.
2. 각 Feature에 `AC-<feature>-<n>` 측정 가능 기준 부여.
3. Track 슬롯(port|greenfield|TBD) · Parent(상위 PRD 인용) 채움.
4. docs/pm/prd.md 로 출력(port면 기존 docs/PRD.md 인용으로 대체).

## Output Format

normalized PRD — Feature별 AC + Risks/Assumptions.

## Stop Condition

- 모든 Feature가 측정 가능한 AC를 가짐 + Track 슬롯 채워짐.
