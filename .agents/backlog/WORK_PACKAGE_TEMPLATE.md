# Work Package 템플릿 (WP = PR)

> WP = 1 worktree = 1 브랜치 `feat/rn-<feature>` = develop 1 PR (D5). 파일 SoT가 없으므로(Work Package는 파일이 아님) 이 템플릿은 PR 본문 shape를 정의한다.

## WP-<feature>

- **브랜치**: `feat/rn-<feature>`
- **Track**: port | greenfield
- **상위 Engineering Story**: <ES-id> (`docs/eng-stories/...`)
- **포함 Agent Task**: `EVAL-<...>` 1~N개 (`evals/tasks/`)

## PR 본문 shape (`.github/pull_request_template.md` 정렬)

- **Summary**: <변경된 동작 — 파일 나열이 아니라 무엇이 달라졌나>
- **Spec or ADR**: <인용>
- **가드레일 체크 4종**: 아키텍처 · 타입/검증 · Supabase/RLS · secret
- **Verification**: <실행 명령 + pass/fail 결과>
- **Rollback**: <되돌리는 방법>

읽는 workflow: split-work-packages.
업데이트 시점: WP 정책 변경 (Level 2).
