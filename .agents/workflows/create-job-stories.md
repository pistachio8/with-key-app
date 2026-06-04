# Workflow: create-job-stories

## Goal
PRD AC → 사용자 언어 Job Story(누가·왜).

## Read First
- normalized PRD · .agents/pm/templates/JOB_STORY_TEMPLATE.md · PM_PLUGIN_ADAPTER

## Inputs
- PRD AC 1~N

## Process
1. "When [상황], I want [동기], so [결과]" 형식. 시스템 용어 금지(그건 Engineering Story).
2. Parent: PRD-AC-<id>.
3. docs/stories/<date>-<feature>-job-stories.md 로 저장.

## Output Format
JS-<feature>-<n> 목록.

## Stop Condition
- 각 핵심 AC가 사용자 의도로 표현됨.
