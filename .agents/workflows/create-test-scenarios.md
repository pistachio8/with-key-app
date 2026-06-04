# Workflow: create-test-scenarios

## Goal
PRD AC → Given/When/Then Test Scenario. 최종 SoT는 Agent Task eval 수용기준(D10).

## Read First
- normalized PRD(.agents/pm/prd.md) · .agents/pm/templates/TEST_SCENARIO_TEMPLATE.md · PM_PLUGIN_ADAPTER

## Inputs
- PRD AC 1~N

## Process
1. 각 AC를 Given/When/Then + expected로 표현(AC와 1:1).
2. Parent: PRD-AC-<id> 인용.
3. docs/stories/<date>-<feature>-test-scenarios.md 로 저장(기존 컨벤션).

## Output Format
TS-<feature>-<n> 목록, 각 AC에 매핑.

## Stop Condition
- 모든 AC가 1개 이상 Test Scenario로 커버됨.
