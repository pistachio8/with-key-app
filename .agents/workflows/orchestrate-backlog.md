# Workflow: orchestrate-backlog

## Goal

backlog 를 1 tick 에 task 1개씩 **다음 사람 게이트까지** 전진시키고, 멈춰서 "사람이 할 일"을 정확히 짚어 보고한다. 상시 자율 루프가 아니다 — 매 tick 은 사람이 게이트를 처리한 뒤 재호출한다 (spec 2026-06-13-harness-orchestration-phase3).

## Read First

- `pnpm harness:next --json` 출력 (입력 SoT)
- [implement-agent-task.md](implement-agent-task.md) · [review-agent-task.md](review-agent-task.md) · [fix-verification.md](fix-verification.md) · [create-agent-tasks.md](create-agent-tasks.md)
- `AGENTS.md` §8 (worktree 커밋 경계) · `docs/migration/05-rn-harness-decisions.md` D5·D6

## Inputs

- 없음 — backlog 상태(`evals/tasks/*` + `evals/results/agent-results.json`)를 `harness:next` 가 읽는다.

## Process — 1 tick

`pnpm harness:next --json` → `{ ready, unblockCandidates, humanGateBlocked, inProgress }` 를 읽고 분기한다. **항상 task 1개만** 집는다(시퀀셜). 자기 스케줄링(`/loop`·`ScheduleWakeup`) 하지 않는다 — 모든 분기가 사람 게이트로 수렴해 깨어나도 할 일이 없다.

1. `inProgress` 있음 → **재개**: 이미 claim 된 task(claim 원자성). worktree 잔존 → 같은 worktree 에서 이어받는다(claim 건너뜀 — 이미 in_progress 라 finalize 전제 충족). → 아래 **실행** 2번부터.
2. `ready` 있음 → `ready[0]`(id 오름차순, 결정론) 1개를 **실행**(아래).
3. `ready`·`inProgress` 비고 `unblockCandidates` 또는 `humanGateBlocked` 있음 → **정지 보고**(아래) 후 종료.
4. 네 채널 전부 빔 → "backlog 소진(open task 전부 done)" 보고 후 종료. (이제 `humanGateBlocked` 덕에 "비었음"이 거짓이 아닐 때만 도달)

### 정지 보고 (3번 분기)

`unblockCandidates`(flip 대기)와 `humanGateBlocked`(게이트 막힘)를 **한 보고로 묶어** 올린다 — 한쪽만 보고하지 않는다(every tick 둘 다, 우선순위 강제 없이 사람이 고른다). `humanGateBlocked[].gates` 토큰을 분류한다:

- **에이전트-가능** (`spec:*` · `adr:*` · 누락 test): "이 게이트는 제가 초안을 뽑아드릴 수 있습니다"라고 **제안만** 한다. 자동 작성·scaffold 생성(`pnpm new spec/adr`)도 하지 않는다 — D6 상 문서 신설/수정은 "제안+사람"이라 scaffold 생성도 사람 승인 영역. 작성은 grill-me 확인 후 사람 트리거.
- **사람 전용** (`gate:*` 법무 · `po:*` 승인): 그대로 사람에게 올린다 — D6 절대 경계.
- `blocked→todo` flip 도 사람 몫 — `unblockCandidates` 는 flip 요청으로 올린다.

### 실행 (1·2번 분기)

1. (재개가 아니면) `pnpm harness:claim <ID>` — todo→in_progress 원자 전이. `harness:finalize` 가 in_progress 를 전제하므로 claim 이 그 전제를 만든다(claim↔finalize 대칭).
2. [implement-agent-task.md](implement-agent-task.md) 전체를 따른다: Source→Target→Verify→리뷰(§5)→Harness Impact→finalize→worktree 커밋. 구현은 메인 세션 inline(EVAL-0019 방식).
3. **push/PR 게이트에서 정지** — push · PR 생성 · PR merge 는 D6 사람. worktree 내 커밋까지는 implementer 자율(`AGENTS.md` §8 예외).
4. **CI 모니터 — 유일한 in-turn 예외**: push 후 `gh pr checks <PR> --watch` 로 결론까지 감시, 실패 시 로그→수정→재푸시→재감시. **재시도 한도 3회** — 3회 재푸시 후에도 빨강이면 사람 에스컬레이트·정지(환경 의존 실패의 무한 재푸시 방지, 비용 상한). 한도 3은 pass@3 과 무관 — CI 실패는 flaky/환경 원인이라 task 크기와 인과가 다르다.

### 부분 실패 (재개·pass@3)

- **pass@3 실패** → `agent-results.json` runs[] 에 `status: "abandoned"` + `attempts` append(성공 없이도 oracle 증거 보존). task 분할(`create-agent-tasks` 재호출)을 **사람에게 올리고 정지** — 드라이버는 자동 재분할·재시도하지 않는다(분할 결정은 D6 사람 게이트). 무한 재분할을 막을 책임은 분할을 결정하는 사람에게 있다.
- **중단 재개** — tick 시작 `inProgress` 가 곧 재개 신호(Process 1번). claim 원자성이 중복 claim 을 막아 새 tick 이 같은 지점을 깔끔히 재개한다.

## Output Format

1 tick 보고: 집은 task(또는 정지 사유) · 수행 단계 · **다음에 사람이 할 일**(flip / `spec`·`adr` 초안 승인 / 법무·PO 게이트 / push·PR·merge) 명시.

## Stop Condition

- 매 tick 은 정확히 한 사람 게이트에서 멈춘다. 자기 재호출 없음 — 사람이 게이트 처리 후 재실행.
- 병렬 implementer 는 범위 밖(spec §C8 확장 여지 — `ready` 폭 ≥2 + 파일 비커플링 충족 시 별도 spec).
- Claude: `/orchestrate-backlog`(`.claude/commands` 래퍼, 로컬) · Codex: 이 파일을 읽고 따름.
