---
prd: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
track: TBD
---

# PRD: {{title}}

> 하네스 표준 PRD. 각 Feature에 측정 가능한 `AC-<feature>-<n>`을 단다 — backlog pipeline·eval 수용기준의 입력. (PM_PLUGIN_ADAPTER 핵심 계약)

## 1. 배경 / 문제

<왜 이 기능이 필요한가. 사용자/비즈니스 문제 1~3 단락.>

## 2. 목표 / 비목표

- 목표: <이 PRD가 달성하려는 것>
- 비목표(non-goal): <명시적으로 범위 밖 — scope 봉인, 원칙 6>

## 3. Features + Acceptance Criteria

각 Feature에 측정 가능한 AC. ID 규약 `AC-<feature>-<n>`.

### Feature: <feature-name>

- `AC-<feature>-1`: <pass/fail 판정 가능한 기준>
- `AC-<feature>-2`: <...>

## 4. Risks / Assumptions

| 항목 | 영향 | 완화 |
|---|---|---|
| <risk/assumption> | <영향> | <완화> |

## 5. 추적성

- 상위: <docs/migration/01-rn-mvp-prd.md 또는 docs/PRD.md 인용>
- 하위 spawn: Test Scenario · Job Story (create-test-scenarios · create-job-stories)

## Track

- port | greenfield (보존 baseline 유무 — Verify 게이트 분기, D2). 미정이면 `TBD`, create-agent-tasks에서 확정.
