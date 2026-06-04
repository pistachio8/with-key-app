---
# evals/tasks/NNNN-<slug>.md frontmatter — harness:check 가 파싱
Task: EVAL-<feature>-<slug>
Track: port | greenfield          # D2 — PR 템플릿·헤더에 강제 노출
Kind: migration | regression       # migration=닫히는 work-unit, regression=영속 baseline
Status: todo | blocked | in_progress | done
Blocked-by: <해제조건, 예: G1-PoC θ 확정>   # blocked 일 때만
---

# <Task ID>: <한 줄 결과>

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)
- Parent PRD Feature: <PRD-AC-id> (docs/migration/01 또는 docs/PRD.md)
- Parent Test Scenario: <TS-id>
- Parent Job Story: <JS-id> (docs/stories/...)
- Parent Engineering Story: <ES-id> (docs/eng-stories/...)
- Parent Work Package: <WP-id> (브랜치 feat/rn-<feature>)

## Goal
<이 태스크가 끝나면 무엇이 참이 되나 — 한 문단>

## Source Files to Inspect
<읽을 기존 파일 경로 — 컨텍스트>

## Target Files
<만들/고칠 파일 경로>

## Requirements
<반드시 충족할 동작 — bullet>

## Non-goals
<이 태스크가 건드리지 않는 것 — scope 봉인, 원칙 6>

## Acceptance Criteria
<pass/fail eval 기준 = Test Scenario 흡수(D10). 결정론 우선>

## Verification Commands
```bash
pnpm typecheck && pnpm lint && pnpm test -- <scope>
# 해당 시: pnpm test -- <capability>   (capability eval)
```

## Expected Output Summary
<에이전트가 끝나고 남길 한 문단 요약의 모양>

## Harness Impact Questions (완료 시 반드시 답 — drift 루프 입력, 원칙 7)
1. Did this task introduce a new folder structure?
2. Did this task introduce a new naming convention?
3. Did this task introduce a new dependency?
4. Did this task change verification commands?
5. Did this task reveal that the current harness instructions are outdated?
6. Should any `.agents/` document (templates · workflows · harness policy/config) be updated?
   # (Prompt 3 원문의 `.harness`는 본 하네스에서 `.agents/harness/`로 접힘 — ADR-0031)
→ 하나라도 yes면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition (원칙 5)
- 모든 Acceptance Criteria green + Verification 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할
  (에이전트 무능/프롬프트 문제 1회 점검 후, 05 §9.4).
