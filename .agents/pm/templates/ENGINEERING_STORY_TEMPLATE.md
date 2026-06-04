---
eng-story: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
---

# Engineering Story: {{title}}

> "[결과]를 위해 시스템은 [기술 변경]을 해야 한다, [제약] 때문에." 시스템 언어(테이블·RPC·RLS·불변식). 1 Engineering Story → N Work Package. (05 §1.2)

## Parent / 직교 인용

- 상위 Job Story: <JS-id>
- 상위 PRD AC: <AC-<feature>-<n>>
- 직교 결정(인용만 — 본문 복제 아님): <docs/adr/NNNN-*.md 또는 docs/superpowers/specs/*>

## 서사 (지을 일 + 엔지니어링 왜)

<시스템이 무엇이 되어야 하나 + 제약/근거. 테이블·RPC·불변식 수준으로.>

## Work Packages (spawn)

- WP1: <1 worktree = 1 PR 단위로 응집된 기능>
- WP2: <...>

## Track

- port | greenfield (보존 baseline 유무 — D2)
