# Workflow: create-engineering-stories

## Goal
Job Story / PRD → Engineering Story(시스템이 무엇이 되어야 하나 + 엔지니어링 왜). 1 ES → N Work Package.

## Read First
- docs/stories/ Job Story · normalized PRD · .agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md · .agents/engineering/INDEX.md · docs/migration/05-rn-harness-decisions.md §1.2

## Inputs
- Job Story + PRD AC

## Process
1. 시스템 언어(테이블·RPC·RLS·불변식)로 작업-서사 작성.
2. 직교 결정 인용(spec/ADR) — 본문 복제 아님.
3. Work Package들 spawn(1 worktree/PR 단위).
4. Track 태그(port|greenfield).
5. docs/eng-stories/<date>-<feature>.md 로 저장.

## Output Format
ES-<feature> + Work Package 목록 + Parent/직교 인용.

## Stop Condition
- ES가 Work Package로 분해됨 + 모든 인용 resolve + Track 태그.
