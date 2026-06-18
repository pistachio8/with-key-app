# Workflow: implement-agent-task

## Goal

Agent Task 1개를 구현해 Acceptance Criteria를 green으로.

## Read First

- 핸드오프된 AT 파일 1개 (오직 1개 — Story·PRD 핸드오프 금지, D5)
- AT의 Source Files to Inspect · .agents/engineering/INDEX.md (코딩 규칙 포인터)

## Inputs

- Agent Task 1개

## Process

1. Source Files 읽어 컨텍스트 확보.
2. Target Files만 수정(Non-goals 봉인 — 무관 코드 안 건드림, surgical).
3. Requirements 구현.
4. Verification Commands 실행 → green 될 때까지(pass@3).
5. **리뷰** — Verify green 직후·finalize 전. tool-neutral baseline 은 [`review-agent-task.md`](review-agent-task.md)(단일 컨텍스트, Codex-followable). Claude 는 큰/다(多)도메인 diff 일 때만 `withkey-review` 스킬로 도메인 리뷰어(frontend/backend/migration/mobile-reviewer) 병렬 fan-out — 작은/단일 도메인 diff 는 단일 컨텍스트 인라인 리뷰(POC 과금 절약). **단, [orchestrate-backlog.md](orchestrate-backlog.md)/tick 무인 경로에서는 diff 크기·도메인 수와 무관하게 항상 fan-out 한다** — 무인 모드에선 작성자 self-review 의 blind spot 제거가 finalize 전제다(Phase 4 §C1). 서브에이전트 출력은 그대로 믿지 않는다 — 메인이 발견을 병합하되 리뷰어 간 사실 충돌은 소스로 검증한 뒤 채택(merge+verify). CRITICAL/HIGH 0건이면 다음 단계로, 있으면 [`fix-verification.md`](fix-verification.md) 로 분기. **왜**: 리뷰는 Verify green 전제·finalize(done flip) 전에 끝나야 하고, per-task 책임이라 드라이버 없이 단일 task 를 돌려도 리뷰가 누락되지 않는다 (spec orchestration-phase3 §C5).
6. Harness Impact Questions 6개 답변. yes 있으면 evals/drift-reports/에 노트.
7. AC green 확정 → `pnpm harness:finalize <EVAL-ID>` 실행 — Status done flip + runs[] skeleton append + `pnpm harness:check` 를 한 명령으로 처리한다. placeholder 안내(exit 1)가 나오면 `evals/results/agent-results.json` 의 `summary`·`verification`(기존 관례 `{ "local": { "<명령>": "<결과>" } }`)·`review`(`{ "reviewers": [...], "criticalHigh": <n>, "verdict": "pass" | "fixed" }` — 무인 fan-out 이면 도메인 reviewer 목록, 수동 inline 이면 `["inline-self-review"]`, Phase 4 §C2)를 채우고 `notes` 불요 시 필드를 삭제한 뒤 같은 명령을 재실행해 exit 0 을 확인한다. 결과는 같은 WP 브랜치에 커밋(PR 에 포함). 머지 후 별도 편집 금지 — status drift 원천 차단(PR 템플릿 Verification 정렬, 누락 시 `pnpm harness:drift` 가 경고).
8. **커밋 권한 경계** — implementer 는 WP worktree 안에서 커밋까지 자율로 수행한다. 푸시·PR 생성은 오케스트레이터가 사용자 확인 후에만. **왜**: worktree 내 커밋은 로컬·가역적 — 저장소 밖으로 나가는 행위(push·PR)만 사람 게이트로 충분하다 (`AGENTS.md` §8 worktree 예외와 동기, spec orchestration-phase2 §C5).
9. **CI 모니터** — 푸시 후 `gh pr checks <PR번호> --watch` 로 성공/실패 결론까지 감시한다. 실패 시 로그 확인 → 수정 → 재푸시 → 재감시. **왜**: 로컬 green ≠ CI green 실측 (PR #216 — 로컬 `harness:verify` 2회 통과 후 CI jest 타임아웃).

## Output Format

변경 파일 목록 + Expected Output Summary + Harness Impact 답변 + Verify 결과.

## Stop Condition

- AT의 Stop Condition 충족. 3회 실패 시 분할 신호(create-agent-tasks 재호출).
- Claude: /implement-agent-task(.claude/commands 래퍼) · Codex: 이 파일을 읽고 따름.
