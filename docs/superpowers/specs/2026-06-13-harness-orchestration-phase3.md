---
spec: 2026-06-13-harness-orchestration-phase3
title: 하네스 오케스트레이션 Phase 3 — 게이트까지 달리는 백로그 드라이버
author: pistachio8
date: 2026-06-13
status: accepted
---

## Summary

Phase 2(spec `2026-06-12-harness-orchestration-phase2`)가 기계 판독 인터페이스 — `harness:next --json`(착수 가능 큐) · `harness:claim`(todo→in_progress 원자 전이) · runs[] `attempts`(pass@3 판정) — 를 깔았다. Phase 3는 그 위에서 backlog를 한 단계씩 전진시키는 **오케스트레이션 드라이버**를 정의한다.

핵심 결정은 정체성이다. backlog 의존 그래프(DAG, Directed Acyclic Graph — 방향 비순환 그래프)를 실측하니 **남은 task의 전진은 구현 속도가 아니라 사람 게이트(법무·spec·PO 승인·flip·push·merge)가 페이스를 정한다.** 그래서 Phase 3는 "상시 자율 루프"가 아니라 **"다음 사람 게이트까지 한 task를 달리고, 멈춰서 '사람이 할 일'을 정확히 짚어 보고하는 드라이버"**다.

설계 리뷰(2026-06-13, 3인 fan-out + 메인 merge+verify)가 초안의 치명적 전제 오류를 잡았다: 현행 `harness:next`는 **사람 게이트로 막힌 task를 어느 채널로도 노출하지 않아**(`detectUnblockCandidates`가 gate/spec/po 토큰 잔존 시 제외) 드라이버가 "backlog 비었음"으로 거짓 보고한다. 실측 `harness:next --json` = `{ ready:[], unblockCandidates:[], inProgress:[] }` — 전부 빈 큐이나 실제 backlog엔 5개가 사람 게이트로 막혀 있다. 따라서 Phase 3는 **`harness:next`에 `humanGateBlocked` 채널을 추가**(소규모 선행 코드)하고, 그 위에 드라이버 워크플로 `.agents/workflows/orchestrate-backlog.md`를 얹는다.

`scripts/**` 코드 + `.agents/**` 문서 변경이라 D6 권한 경계상 "제안+사람" 영역이며, 본 spec이 그 제안서다(Phase 2와 동일 절차). 머지되면 구현 PR이 2개 따라온다(§Rollout).

## Why

Phase 2 인터페이스는 깔렸지만, 그것들을 "엮어서 도는" 단일 절차가 없고, 사람 게이트로 막힌 backlog를 드라이버가 읽을 채널이 없다.

- **사람 게이트로 막힌 task가 어디에도 노출되지 않는다** — `harness:next`의 `ready`(flip 대기)·`unblockCandidates`(순수 task 의존 해소)·`inProgress` 셋은 모두 "에이전트가 곧 손댈 수 있는" task만 담는다. `gate:G2`·`spec:*`·`po:*` 토큰이 남은 task는 `detectUnblockCandidates`가 의도적으로 제외(`harness-lib.mjs:246`)하므로 셋 다 비고, 드라이버는 "비었음"으로 멈춘다. **하지만 backlog는 안 비었다** — 사람이 다음에 무엇을(법무·spec·PO) 처리해야 backlog가 다시 흐르는지가 기계로 안 보인다.
- **파이프라인을 엮는 절차가 산문에만 있다** — `harness:next`로 다음 task를 알고, `claim`으로 잡고, `implement-agent-task`로 구현하고, 리뷰하고, `finalize`하는 전체 흐름이 어느 워크플로에도 한 곳에 적혀 있지 않다. EVAL-0017·0019는 사람(메인 세션)이 매번 머릿속으로 이었다.
- **리뷰 워크플로가 있으나 구현 파이프라인에서 호출되지 않는다** — `review-agent-task.md`는 존재하지만, `implement-agent-task.md`의 번호 단계(claim→Verify→finalize)에 **리뷰 호출 단계가 없다**(실측). EVAL-0019의 도메인 리뷰어 fan-out은 사용자가 별도로 요청해서야 돌았고, 그 리뷰가 Major 4건을 실제로 잡았다.
- **"상시 루프"는 이 backlog에서 토큰만 태운다** — 모든 루프 반복이 사람 게이트에서 끝난다(§Design 근거표). `/loop`로 자기 스케줄링하면 깨어나도 같은 미해결 게이트를 보고 토큰만 소모한다(POC 비용·수동 우선 원칙과 충돌).
- **부분 실패·중단 재개·실패 한도가 워크플로에 없다** — pass@3 실패 종결(abandoned)과 worktree 중단 후 재개는 Phase 2가 데이터 스키마로 지원하지만, 드라이버가 그 상태를 읽어 어떻게 행동할지, CI 재시도를 몇 번에 끊을지가 적혀 있지 않다.

## Impact Scope

### 변경 경로

- 신규:
  - `.agents/workflows/orchestrate-backlog.md` — 백로그 드라이버 워크플로 (tool-neutral, Codex·Claude 공통 평문 실행)
- 수정:
  - `scripts/harness-lib.mjs` — `resolveHumanGateBlocked()` 추가 (blocked + task 의존 전부 done + 비-task 토큰 잔존인 task를 잔존 토큰과 함께 반환). 기존 `parseBlockers`·`statusById` 재사용
  - `scripts/harness-next.mjs` — `--json` 출력 + 사람용 텍스트 뷰 양쪽에 `humanGateBlocked` 채널 추가
  - `scripts/harness-lib.spec.mjs` — `resolveHumanGateBlocked` 단위 테스트
  - `.agents/workflows/implement-agent-task.md` — Verify(현 4) 직후 **리뷰 호출 단계**를 신규 5로 삽입, 기존 5~8을 6~9로 재번호(§C5)
  - `.agents/README.md` — 작업 종류→workflow 매핑에 "backlog 전진" 1행 + tool-neutral SoT 카운트 9→10
  - `.claude/commands/orchestrate-backlog.md` — Claude 슬래시 래퍼 (선택, 로컬 `.gitignore` 대상)

### src/ 영향

없음 — `apps/web/src/**` · `apps/mobile/src/**` 무변경. 하네스 머시너리(`scripts/` · `.agents/`)만.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음. (CI 모니터는 기존 `gh pr checks --watch` 재사용 — `implement-agent-task.md` §8에 이미 존재)

## Design

드라이버는 1회 호출에 **task 한 개를 다음 사람 게이트까지** 민다. 상태 기계의 단일 tick이며, tick 사이는 사람이 게이트를 처리한 뒤 재호출한다. C1은 선행 코드(harness 확장), C2~C8은 드라이버 워크플로.

### C1 — `harness:next` 확장: `humanGateBlocked` 채널 (선행 코드)

현행 출력 3채널에 4번째를 더한다. **왜**: 사람 게이트로 막힌 task가 기계로 안 보여 드라이버가 "비었음"으로 거짓 보고하는 게 초안의 Blocker였다(설계 리뷰 B1). 게이트 토큰을 구조화해 노출해야 드라이버가 agent-doable/human-only를 산문 파싱 없이 분류한다.

```jsonc
// pnpm harness:next --json (Phase 3 확장)
{
  "ready": [], // flip 대기: 순수 task 의존, 전부 done (Phase 2)
  "unblockCandidates": [], // blocked인데 task: blocker 전부 done — flip은 사람 (Phase 2)
  "humanGateBlocked": [
    // 신규: task 의존은 다 풀렸으나 비-task 게이트가 남음
    { "id": "EVAL-0007", "gates": ["gate:G2"] },
    { "id": "EVAL-0009", "gates": ["gate:G2", "spec:analytics-union", "po:analytics-union"] },
    { "id": "EVAL-0025", "gates": ["spec:reaction-storage", "po:reaction-storage"] },
  ],
  "inProgress": [],
}
```

- 채널 정의: `Status: blocked` **AND** `task:` 토큰이 전부 done(또는 archive 은퇴) **AND** 비-task 토큰(`gate`·`adr`·`spec`·`po`) ≥1 잔존. 엔트리는 잔존 비-task 토큰을 같이 싣는다. **왜**: 토큰을 JSON에 실어야 드라이버가 task 파일을 다시 안 읽고 분류한다(리뷰 M1 해소).
- 토큰은 **`Blocked-by` 필드**에서 읽는다 — `unblockCandidates`와 같은 필드(`harness-lib.mjs:244`). `Depends-on`(todo intra-feature 순서)이 아니다. **왜**: 하드 게이트는 `Blocked-by`(+`Status: blocked`), intra-feature 순서는 `Depends-on`(+`Status: todo`)으로 역할이 갈린다(`AGENT_TASK_TEMPLATE.md:7-8`).
- `task:` 의존이 아직 미완인 task(예: EVAL-0008·0026은 `task:EVAL-0025` blocked)는 **제외** — 상류 task가 끝나야 의미 있는 후보다. **왜**: `unblockCandidates`/`humanGateBlocked` 양쪽 다 "task 의존은 다 풀린" 집합만 노출해 일관성을 유지한다. 두 채널은 토큰 구성으로 상호 배타(비-task 0개 vs ≥1개)라 겹치지 않는다.
- 판정 로직은 `harness-lib.mjs`에 `resolveHumanGateBlocked()`로 두고, 기존 `parseBlockers`·`taskStatusById`를 재사용한다(`isUnblockCandidate`의 정확한 여집합). **왜**: 게이트 토큰 파싱이 드라이버 산문에 박히면 `scan-signals`·`resolveReadyTasks`에 이은 3번째 중복본이 된다 — 판정은 lib 단일 SoT(Phase 2 `resolveReadyTasks` 추출 정신).
- `--json`뿐 아니라 `pnpm harness:next`(플래그 없이) **사람용 텍스트 뷰**에도 같은 task를 표시한다(PR-A 범위). **왜**: JSON만 고치면 사람이 텍스트로 볼 때 게이트 막힌 task가 여전히 안 보이는 비대칭이 남는다.

**근거표 — 남은 5개 open task가 무엇에 막혀 있나** (2026-06-13 실측, EVAL-0019는 done·PR #224 merged로 제외):

| Task      | `task:` 의존              | 잔존 사람 게이트                          | `harness:next` 채널     |
| --------- | ------------------------- | ----------------------------------------- | ----------------------- |
| EVAL-0007 | 0005·0006 ✅              | `gate:G2`(법무)                           | **humanGateBlocked**    |
| EVAL-0009 | 0005·0006 ✅              | `gate:G2` + `spec:analytics-union` + `po` | **humanGateBlocked**    |
| EVAL-0025 | 0020 ✅                   | `spec:reaction-storage` + `po` + ADR-0032 | **humanGateBlocked**    |
| EVAL-0008 | 0005·0006 ✅, **0025 ⛔** | `gate:G2`                                 | (제외 — task 의존 미완) |
| EVAL-0026 | 0022 ✅, **0025 ⛔**      | `spec:verify-analytics` + `po`            | (제외 — task 의존 미완) |

5개 전부 task 완료가 아니라 사람 게이트로 막혀 있다. 신규 채널이 노출하는 actionable triage 집합 = `[0007, 0009, 0025]`. (표의 "잔존 사람 게이트" 열은 사람용 요약이라 prose 맥락—예: 0025의 ADR-0032—을 포함하나, 채널이 싣는 건 `Blocked-by`의 `[type:value]` 토큰뿐이다: 0025는 `spec:reaction-storage`·`po:reaction-storage`.) (병렬 ready 폭 ≥2는 사실상 안 생긴다 — settlement 0007+0009가 같은 도메인 `lib/db/reads`·`points_balance_view` 이벤트를 공유해 파일 커플링이라 worktree 병렬이면 충돌 위험. 단 이 "병렬 희소" 결론은 현 backlog 의존적이며, 순수 task 의존 체인이 늘면 재검토한다 — §C8.)

### C2 — 드라이버 루프 골격 (stop-at-gate)

1 tick = `harness:next --json` 읽고 분기. **왜**: 다음 행동의 입력이 산문이 아니라 구조화 데이터(C1)여야 절차가 결정론적이 된다.

```text
tick():
  q = harness:next --json     # { ready, unblockCandidates, humanGateBlocked, inProgress }
  if q.inProgress 있음        → C7 재개 분기 (중단된 task 이어받기)
  elif q.ready 있음           → C4 (ready[0] 한 개 실행 → 사람 게이트에서 정지)
  elif q.unblockCandidates 또는 q.humanGateBlocked 있음
                              → C3 (한 보고로 묶어: unblockCandidates=flip 요청 + humanGateBlocked=게이트 분류) → 정지
  else                        → "backlog 소진(open task 전부 done)" 보고 → 정지
```

- **항상 task 1개만** 집는다(시퀀셜). 병렬 implementer는 §C8 확장 여지로만. **왜**: DAG상 `ready` 폭 ≥2가 사실상 안 생기고, push/PR이 사람 게이트라 병렬이 wall-clock을 거의 못 줄인다.
- 매 tick은 **한 사람 게이트에서 멈춰 보고**하고 끝난다 — 자기 스케줄링(`/loop`·`ScheduleWakeup`) 안 한다. **왜**: 모든 분기가 사람 게이트로 수렴하므로 깨어나도 할 일이 없다.
- `else`(진짜 소진) 분기는 **네 채널이 전부 비었을 때만** 도달한다 — 이제 `humanGateBlocked`가 있어 "비었음" 오보(초안 Blocker)가 사라진다.
- ready[0] 선택은 task id 오름차순(결정론). **정지-보고 두 채널(`unblockCandidates`·`humanGateBlocked`)은 한쪽만 보고하지 않고 합쳐서** 올린다(전부, 우선순위 강제 안 함 — 사람이 고른다). **왜**: `unblockCandidates`만 보고하면 flip 안 될 때까지 매 tick 같은 flip 요청만 반복하고 게이트 막힌 다른 task triage가 영영 가려진다(리뷰 지적).

### C3 — 정지 보고: flip 요청 + 게이트 분류

`ready`·`inProgress`가 비면 `unblockCandidates`(flip 대기)와 `humanGateBlocked`(게이트 막힘)를 **한 보고로 묶어** 올리고 멈춘다. `humanGateBlocked` 엔트리의 `gates` 토큰은 **에이전트-가능 / 사람 전용**으로 분류한다. **왜**: "다음에 사람이 뭘 해야 하는지"를 토큰에서 기계적으로 도출해 매 tick 수동 해석을 없앤다.

- **에이전트-가능** (`spec:*` · `adr:*` · 누락 test): "이 게이트는 제가 초안을 뽑아드릴 수 있습니다"라고 **제안만** 한다. 자동 작성하지 않는다. **왜**: spec/ADR 작성 전 스킬 확인(grill-me)은 작성 규칙이고, PO·설계 판단은 사람 몫이다.
- **사람 전용** (`gate:*` 법무 · `po:*` 승인): 그대로 사람에게 올린다 — D6 절대 경계.
- 회색지대 명문화: 드라이버가 `pnpm new spec`/`new adr`로 **빈 scaffold 파일을 생성하는 것도 "작성"으로 본다**(제안 아님). 제안 = 텍스트 보고뿐. **왜**: D6상 문서 신설/수정은 "제안+사람"이라 scaffold 생성도 사람 승인 영역에 둔다.
- 예: 현 backlog → "EVAL-0025·0009: `spec` 초안 제가 작성 제안 가능(grill-me 확인 후) / EVAL-0007·0009: `gate:G2` 법무, 전부 `po` 승인 — 사람 필요".

### C4 — task 1개 실행 (claim → implement-agent-task)

`ready[0]`을 `harness:claim`으로 잡고 `implement-agent-task.md`를 따른다. 드라이버는 **얇은 outer 루프**로 per-task 책임을 implement-agent-task에 위임한다.

- 순서: `claim`(todo→in_progress) → `implement-agent-task` 전체(Source→Target→Verify→**리뷰(§C5)**→finalize→worktree 커밋) → **push/PR 게이트에서 정지(§C6)**.
- `harness:finalize`는 `in_progress`를 입력으로 요구한다(`harness-finalize.mjs:76` — todo면 `--force` 요구). claim이 그 전제를 만든다. **왜**: claim→finalize 대칭이 상태 전이를 추적 가능하게 한다.
- 구현은 메인 세션이 inline 수행(EVAL-0019 방식). implementer 서브에이전트 위임은 §C8 확장 여지.

### C5 — 리뷰 단계 (implement-agent-task에 삽입 + withkey-review 재사용)

리뷰를 **`implement-agent-task.md`에 신규 단계로 삽입**한다(현재 없음). 구체 위치: 현 단계 4(Verify green) 직후에 **신규 5단계 = 리뷰**를 넣고, 기존 5(Harness Impact)→6, 6(finalize)→7, 7(커밋)→8, 8(CI)→9로 재번호. **왜**: 리뷰는 Verify green을 전제하고 finalize(done flip) 전에 끝나야 한다 — Harness Impact(drift 노트)보다 앞서 두어 "코드가 옳은가"를 먼저 본다. 드라이버가 아니라 per-task 워크플로에 두는 이유: 리뷰는 task 단위 책임이고, 그래야 드라이버 없이 단일 task를 돌릴 때도 리뷰가 누락되지 않는다.

- **기존 메커니즘 재사용**: tool-neutral baseline은 `review-agent-task.md`(단일 컨텍스트, Codex-followable). Claude는 큰/다(多)도메인 diff일 때 `withkey-review` 스킬로 fan-out하는 어댑터. 새 리뷰 메커니즘을 만들지 않는다.
- **조건부 fan-out**: 작은/단일 도메인 diff는 단일 컨텍스트 인라인 리뷰(skill baseline). 큰/다도메인 diff일 때만 도메인 리뷰어(frontend/backend/migration/mobile-reviewer) 병렬. **왜**: 매 task 무조건 fan-out은 작은 diff에도 과금 — POC 비용·수동 우선과 충돌.
- **merge+verify 필수**: 서브에이전트 출력을 그대로 믿지 않는다. 메인이 발견을 병합하되 리뷰어 간 사실 충돌은 소스로 검증한 뒤 채택한다. **왜**: EVAL-0019에서 backend-reviewer가 "route.spec에 forbidden→403 단언 없음"이라 보고했으나 소스(`route.spec.ts:78`)에 실재해 기각 — 이 검증이 fan-out의 비용을 정당화하는 지점이다.
- **리뷰 발견 처리**: CRITICAL/HIGH 0건이면 finalize로. 있으면 `fix-verification.md` 워크플로로 분기(코드 버그 vs 테스트 오류 vs AT 과대 분류). **왜**: `review-agent-task.md`의 Stop Condition이 이미 fix-verification으로 보내므로 드라이버가 자체 분기를 만들지 않는다.

### C6 — 사람 게이트 정지점 + CI 예외·한도

드라이버가 멈추는 지점과 사유:

- `blocked→todo` flip · push · PR 생성 · PR merge — D6 사람. worktree 내 커밋까지는 implementer 자율(`implement-agent-task.md` §7 · AGENTS.md §8 예외).
- **CI 모니터 — 유일한 in-turn 예외**(기존 재사용, 신규 아님): push 후 `gh pr checks <PR> --watch`로 결론까지 감시, 실패 시 로그→수정→재푸시→재감시(`implement-agent-task.md` §8). **왜**: CI는 기계 관측 가능한 유일 게이트라 사람을 기다릴 필요가 없다(로컬 green ≠ CI green 실측, PR #216).
- **CI 재시도 한도 = 3회(임의 비용 상한)**: 같은 PR이 3회 재푸시 후에도 빨가면 사람에게 에스컬레이트하고 정지한다. **왜**: 한도가 없으면 환경 의존 실패(PR #216류)에서 무한 재푸시로 토큰을 태운다. 3은 무한 재푸시를 막는 비용 상한일 뿐 pass@3(task 크기 oracle)과 무관하다 — CI 실패는 flaky/환경 원인이라 task 크기와 인과가 다르다.

### C7 — 부분 실패 · 중단 재개

- **pass@3 실패** → 사람이 분할을 결정. 드라이버는 runs[]에 `status: "abandoned"` + `attempts` 엔트리를 append해 oracle 증거를 남기고(Phase 2 C3), task 분할(`create-agent-tasks` 재호출)을 사람에게 올린다.
- **abandoned는 드라이버가 자동 재시도하지 않는다**: pass@3 실패 → 드라이버는 abandoned append 후 **멈추고 사람에게 분할을 올린다**(분할 결정은 D6 사람 게이트). 따라서 "드라이버가 재분할 루프에 빠지는" 경로는 애초에 없다 — 매 tick은 사람 재호출로만 돈다(§C2). **무한 재분할을 막을 책임은 분할을 결정하는 사람에게 있다.** **왜**: task 분할 provenance(어느 abandoned에서 갈라졌나)를 식별할 기계 데이터가 없다 — AT `Parent Links`는 PRD/Story 추적성이고 runs[]에 lineage 키가 없다(`harness-lib.mjs:30`). 드라이버가 계보를 기계로 가드한다는 설계는 구현 불가라 사람 판단으로 둔다(필요해지면 `split-work-packages`가 새 AT에 `Splits-from:` 토큰을 기록하는 별도 결정).
- **중단 재개** — tick 시작에 `inProgress`가 있으면, 그 task는 이미 `claim`된 것(claim 원자성). worktree가 잔존하므로 같은 worktree에서 이어받는다(claim 건너뜀 — 이미 in_progress라 finalize 전제 충족). **왜**: claim이 원자 전이라 중복 claim이 막히고, 새 tick이 깔끔히 같은 지점을 재개한다.

### C8 — 병렬 implementer (확장 여지 — 미구현)

지금 구현하지 않는다. 발동 조건이 충족되면 별도 spec으로 승격한다.

- **발동 조건**: `ready` 폭 ≥2 **AND** 후보 WP들이 파일 비(非)커플링(서로 다른 도메인·디렉토리). 둘 다여야 worktree 병렬이 충돌 없이 wall-clock을 줄인다.
- **구현 시 메커니즘**: Claude `Workflow` 도구의 `parallel()` + `isolation: 'worktree'`로 implementer 서브에이전트 N개. 단 push/PR은 여전히 사람 게이트라 직렬 — 병렬은 구현 단계에만 적용된다.
- **왜 미루나**: DAG상 발동 조건이 현 backlog에서 거의 안 생기고, 미사용 병렬 머시너리는 Claude-lock + 유지보수 부담만 남긴다. "거의 없음 + 발동 조건 명시 + 미구현"은 §C2 시퀀셜 기본과 모순이 아니라 조건부 future-proofing이다.

## Alternatives Considered

1. **상시 자율 루프(`/loop` · `ScheduleWakeup` self-schedule)** — 모든 분기가 사람 게이트로 수렴하므로 깨어나도 같은 미해결 게이트를 보고 토큰만 태운다. 기각 — 드라이버는 게이트에서 멈추고 사람이 재호출한다.
2. **Claude `Workflow` 도구 어댑터를 지금 구현(하이브리드 양쪽 다)** — 시퀀셜·stop-at-gate로 정해진 이상 `parallel()`·schema 출력의 값이 거의 놀고, Claude-lock + markdown과 이중 유지보수 부담만 는다. 기각 — markdown SoT 하나만, Workflow 도구는 §C8 발동 시 미래 옵션. (§C8과 자기모순 아님 — "지금 안 씀 + 조건 충족 시 옴".)
3. **B1 fix를 드라이버가 task 파일 직접 스캔으로** — 게이트 토큰 파싱이 드라이버 산문에 박혀 `scan-signals`·`resolveReadyTasks`에 이은 3번째 중복 판정본이 된다. 기각 — `harness:next` 확장(C1)으로 판정을 lib 단일 SoT에 둔다(Phase 2 추출 정신). ← 이게 ② 선택의 근거.
4. **새 워크플로 문서 신설 vs `implement-agent-task.md` 보강만** — 리뷰가 "순신규는 C1+C2뿐"이라 지적. 해소: per-task 책임(리뷰)은 `implement-agent-task.md`에 넣고(§C5), backlog 단위 책임(다음 task 선택 §C2 · 게이트 분류 §C3)만 outer 루프 문서로 분리한다. **왜**: implement-agent-task는 단일 task 워크플로라 "다음에 뭘"·"무엇이 막혔나"를 담을 자리가 아니다. C1 harness 확장 + C2/C3가 별도 문서를 정당화한다.
5. **항상 implementer 서브에이전트로 병렬 분배** — DAG상 `ready` 폭 ≥2가 거의 없고 push/PR이 사람 직렬이라 wall-clock 이득이 제한적. 매 task 핸드오프 비용 + 메인 누적 컨텍스트 손실만 크다. 기각 — 시퀀셜 inline 기본(§C2).
6. **`parity-critic` 신규 리뷰어(web↔RN BFF 패리티)** — 패리티는 공유 `submitActionLogCore`로 by-construction 보장되고 `route.spec`·`submit-core.spec`로 lock돼 있다. 기각 — `backend-reviewer`는 이미 `src/app/api/*`(external-callback only) 범위를 가지므로, BFF route 정밀 점검이 필요하면 그 범위 주석을 "BFF Bearer 포함"으로 한 줄 넓히는 것으로 족하다.
7. **새 핸드오프 schema(오케스트레이터↔리뷰어 기계 계약)** — Phase 2의 `harness:next --json`·`claim`·`attempts` + C1 `humanGateBlocked`가 이미 기계 인터페이스이고, 리뷰 입출력은 withkey-review의 심각도 분류(Blocker/Major/Minor)를 그대로 쓴다. 기각 — 신규 schema는 중복.

## Verification

C1(코드)은 단위 테스트로, 드라이버 워크플로는 절차 정합성·dogfood로 검증한다.

### 명령

```bash
pnpm harness:test         # resolveHumanGateBlocked 단위 테스트
pnpm harness:next --json  # humanGateBlocked 채널 실데이터 확인
pnpm harness:check        # backlog 무결성(채널 추가가 깨지 않는지)
pnpm harness:verify       # 통합 (typecheck + lint + test + check + harness:test)
pnpm validate:docs        # 문서 내부 링크 깨짐
```

### 시나리오

- 정상(현 backlog): `harness:next --json` → `humanGateBlocked = [{0007: [gate:G2]}, {0009: [gate:G2, spec, po]}, {0025: [spec, po]}]`, 나머지 채널 빈 큐. 드라이버 → "0025·0009 spec 초안 제안 가능(grill-me 확인 후) / 0007·0009 G2 법무·전부 PO — 사람 필요" 보고·정지.
- 정상: `humanGateBlocked`의 한 게이트가 풀려(예: G2 통과 → EVAL-0007이 순수 게이트 해소) `ready`로 승격 → `claim`→구현→리뷰(조건부 fan-out)→merge+verify→finalize→push 게이트 정지.
- 정상: 큰 다도메인 diff에서 리뷰가 fan-out하고, 메인이 리뷰어 충돌을 소스로 검증해 false positive를 기각(EVAL-0019 패턴).
- 실패: 같은 task 3회 시도 실패 → `abandoned` 엔트리 append + 분할 제안. `harness:check` 통과(done-run parity 안 깨짐).
- 실패: 리뷰 CRITICAL/HIGH가 남고 구현이 못 고침 → `fix-verification.md`로 분기, pass@3 도달 시 abandoned.
- 실패: CI가 3회 재푸시 후에도 빨강 → 사람 에스컬레이트·정지(무한 재푸시 없음).
- 엣지: `task:` 의존 미완 task(0008·0026)는 `humanGateBlocked`에 안 뜬다(상류 task 대기).
- 엣지: 네 채널 전부 빈 배열 = 진짜 backlog 소진(open task 전부 done) → "소진" 보고. (이제 "비었음"이 거짓이 아닌 경우에만)
- 엣지: tick 시작에 `inProgress` 존재(이전 tick 중단) → 같은 worktree에서 재개, 중복 claim 없음.

### dogfood

C1 머지 후 현 backlog에서 드라이버 1 tick을 돌려 `humanGateBlocked` 분류 보고를 실전 확인하고(기대: `[0007, 0009, 0025]` triage), 마찰을 본 spec에 환류한다. settlement G2 통과 또는 spec 작성으로 `ready`가 생기면 full 파이프라인 tick을 2호 run으로 검증.

## Rollout

PR 2개 — 머시너리 코드와 `.agents/` 문서의 승인 게이트가 다르므로 섞지 않는다(Phase 2 선례). **PR-A를 먼저 머지한다(역순 금지)** — PR-B의 드라이버는 `harness:next`의 `humanGateBlocked` 채널에 **런타임 의존**하므로, PR-A 없이 PR-B만 머지되면 드라이버가 없는 채널을 읽어 `else` 분기로 떨어져 초안의 거짓 "비었음"이 그대로 재현된다(리뷰 지적).

1. **PR-A `feat/harness-next-human-gate`**: C1 — `harness-lib.mjs` `resolveHumanGateBlocked()` + `harness-next.mjs` 채널 + `harness-lib.spec.mjs` 테스트. `scripts/**`만 — `apps/**`·`.agents/**` 무변경.
2. **PR-B `docs/harness-orchestration-phase3`**: 본 spec(승격) + `.agents/workflows/orchestrate-backlog.md` + `implement-agent-task.md` 리뷰 단계(§C5) + `.agents/README.md` 1행·카운트. `.agents/**` 변경이라 리뷰가 곧 D6 사람 승인.
3. **(선택) Claude 래퍼** `.claude/commands/orchestrate-backlog.md` — 로컬 `.gitignore` 대상이라 커밋 불요.
4. **dogfood**: §Verification dogfood를 PR-A·PR-B 머지 후 실행.

### 롤백

PR-A·PR-B 각각 1 commit revert. `humanGateBlocked`는 출력 추가라 제거해도 기존 3채널 동작 무변경. 워크플로 문서는 되돌리면 EVAL-0017·0019처럼 사람이 수동으로 파이프라인을 엮는 상태로 복귀.

## Out of scope

- 병렬 implementer 실제 구현(§C8) — 발동 조건 충족 시 별도 spec.
- Claude `Workflow` 도구 스크립트 — 미래 옵션(§Alternatives 2).
- `blocked→todo` 자동 flip · PR 자동 머지 — D6 사람/절대 금지 유지.
- spec/ADR **자동** 작성 · scaffold 생성 — 드라이버는 제안만, 작성은 grill-me 확인 후 사람 트리거(§C3).
- PRD·AC·게이트 값 변경 — 하네스 정책상 에이전트 불가 영역.
- `harness:claim`·`finalize` 등 Phase 2 인터페이스 재설계 — 본 spec은 `humanGateBlocked` 채널만 더하고 절차를 얹는다.

## 용어집

- **agent-doable 게이트**: 에이전트가 초안을 뽑을 수 있는 blocker(`spec:*` · `adr:*` · 누락 test) — 드라이버는 작성이 아니라 제안만 한다
- **abandoned**: pass@3 실패로 사람이 분할을 결정해 종결된 run의 `status` 값 — 성공 없이도 oracle 증거를 runs[]에 남긴다(Phase 2 C3)
- **DAG**: Directed Acyclic Graph(방향 비순환 그래프) — task 간 의존 관계 그래프. 본 spec의 "병렬 거의 없음" 결론의 근거
- **D5 / D6**: `docs/migration/05-rn-harness-decisions.md`의 결정 번호 — D5는 원자 단위(1 WP=1 PR · pass@3), D6는 권한 경계 3단(자율 / 제안+사람 / 절대 금지)
- **드라이버**: 1 호출(tick)에 task 1개를 다음 사람 게이트까지 밀고 멈춰 보고하는 오케스트레이션 절차 — 상시 자율 루프가 아니다
- **fan-out**: 변경 도메인별로 리뷰어 서브에이전트를 병렬 호출하는 리뷰 패턴(withkey-review 스킬)
- **humanGateBlocked**: `harness:next`의 신규 채널 — task 의존은 다 풀렸으나 비-task 게이트(법무·spec·PO·ADR)가 남은 task를 잔존 토큰과 함께 노출
- **merge+verify**: 서브에이전트 리뷰 출력을 병합하되 사실 충돌을 소스로 재검증해 채택하는 단계 — fan-out의 비용을 정당화하는 지점
- **사람 게이트(human gate)**: 에이전트가 넘을 수 없는 정지점 — `gate:*`(법무) · `po:*`(PO 승인) · `blocked→todo` flip · push · PR · merge
- **pass@3**: 같은 task를 3회 시도해도 실패하면 task가 너무 크다는 분할 신호(D5 oracle)
- **stop-at-gate**: 드라이버가 자기 스케줄링 없이 다음 사람 게이트에서 멈추는 동작 원칙
- **tick**: 드라이버의 1회 호출 = task 1개를 한 게이트까지 미는 단위
- **WP(Work Package)**: 1 worktree = 1 브랜치 = 1 PR 단위의 작업 묶음
