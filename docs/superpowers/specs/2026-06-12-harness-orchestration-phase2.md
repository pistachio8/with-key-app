---
spec: 2026-06-12-harness-orchestration-phase2
title: 하네스 오케스트레이션 Phase 2 — 기계 판독 인터페이스
author: pistachio8
date: 2026-06-12
status: draft
---

## Summary

EVAL-0017 멀티 에이전트 파일럿(PR #215 · #216)에서 오케스트레이터가 사람 판단으로 메꿨던 구멍을 하네스 CLI(Command Line Interface)와 워크플로 문서로 채운다. 핵심은 세 가지 기계 판독 인터페이스 — `harness:next --json`(착수 가능 task 큐), `harness:claim`(todo→in_progress 원자 전이), runs[] `attempts` 필드(pass@3 기계 판정) — 와 파일럿에서 실측된 신뢰성 마찰 수정이다.

이 spec이 머지되면 구현 PR이 2개로 따라온다(§Rollout). `.agents/**` 워크플로 문서 변경이 포함되므로 D6 권한 경계상 "제안+사람" 영역이며, 본 spec이 그 제안서다.

## Why

파일럿에서 파이프라인(flip→구현→리뷰 fan-out→fix→finalize→PR→CI)은 완주했지만, 아래 지점은 기계가 못 읽어 사람이 수동 개입했다. Phase 3(상시 루프)로 가려면 이 지점들이 코드가 되어야 한다.

- **READY 판정이 산문에만 있다** — `harness:drift`는 unblock 후보를 산문으로 출력하고, depends-on 해석(READY/WAITING)은 `.claude/skills/withkey-todo/scripts/scan-signals.mjs:98-128`에 중복 구현돼 있다. JSON으로 주는 명령이 없어 오케스트레이터가 파싱할 수 없다.
- **todo→in_progress 전이 명령이 없다** — `harness:finalize`는 `Status: todo`를 거부한다(EVAL-0017에서 실측). 어느 워크플로에도 전이 단계가 없어 정상 경로로 finalize에 도달할 수 없고, 파일럿에서는 sed로 때웠다. 병렬 실행 시 같은 task를 두 에이전트가 잡는 것을 막을 잠금도 없다.
- **pass@3 oracle을 기계가 판정 못 한다** — D5의 크기 oracle(3회 실패 → 분할 신호)을 쓰려면 runs[]에 시도 횟수가 있어야 한다. 기존 `oneShot`(boolean) 필드가 있지만 비검증이라 EVAL-0017 파일럿 엔트리에서 이미 누락됐고(실증), 3회 실패로 분할 종결된 task는 성공 엔트리가 아예 생기지 않아 oracle 증거가 남을 곳이 없다.
- **goal 프롬프트가 죽은 base 브랜치를 렌더한다** — `renderGoalPrompt`(`scripts/harness-lib.mjs:647`)는 선행 WP 브랜치 실존 확인 없이 base로 쓴다. EVAL-0017에서 머지-삭제된 `feat/rn-router-skeleton`이 base로 렌더됐다.
- **로컬 green ≠ CI green** — 로컬 `harness:verify` 2회 통과 후에도 CI에서 jest 타임아웃으로 실패했다(PR #216). 자동 루프에 CI 모니터→수정→재푸시 단계가 명문화돼 있지 않다.
- **implementer 커밋 권한이 모호하다** — `implement-agent-task.md` step 6은 finalize+커밋을 implementer에 부여하는데, goal 프롬프트는 "커밋/푸시는 사용자 확인 후에만"이라 충돌한다.
- **RN(React Native) 리뷰 공백** — 기존 도메인 리뷰어 3종(migration/frontend/backend)은 `apps/web`·`supabase` 범위라 `apps/mobile` 변경을 깊게 보는 리뷰어가 없다.

## Impact Scope

### 변경 경로

- 신규:
  - `scripts/harness-next.mjs` — READY 큐 JSON 출력
  - `scripts/harness-claim.mjs` — todo→in_progress 전이
  - `.claude/agents/mobile-reviewer.md` — RN 도메인 리뷰어 (로컬 전용, `.gitignore` 대상)
- 수정:
  - `scripts/harness-lib.mjs` — `resolveReadyTasks()` 추출 · `defaultLookupBranch` 브랜치 실존 확인
  - `scripts/harness-finalize.mjs` — runs[] skeleton에 `attempts` 필드
  - `scripts/harness-check.mjs` — `attempts` 정수 검증
  - `scripts/harness-drift.mjs` — `attempts >= 3` size oracle advisory (C3)
  - `scripts/harness-lib.spec.mjs` — 신규 로직 단위 테스트
  - `.agents/backlog/AGENT_TASK_TEMPLATE.md` — C7 Verification 주석 1줄
  - `package.json` — `harness:next` · `harness:claim` 스크립트 엔트리
  - `.agents/workflows/implement-agent-task.md` — 커밋 권한 명문화 · CI 모니터 단계
  - `AGENTS.md` §8 — "자동 커밋·푸시는 사용자 확인 후에만" 규칙에 worktree 한정 예외 1줄 (C5와 동기)
  - `.claude/skills/withkey-todo/scripts/scan-signals.mjs` — READY 로직을 lib import로 교체 (후속, soft)

### src/ 영향

없음 — `apps/web/src/**` · `apps/mobile/src/**` 무변경. 하네스 머시너리(`scripts/` · `.agents/`)만.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음. (CI 모니터 단계는 기존 `gh pr checks` 사용 — 신규 의존 없음)

## Design

오케스트레이터가 도는 루프의 각 단계에 기계 판독 인터페이스를 하나씩 댄다. C1~C4는 코드, C5~C7은 문서/컨벤션.

### C1 — `harness:next --json`

`evals/tasks/*.md`를 읽어 착수 가능 큐를 JSON으로 출력한다. **왜**: 오케스트레이터의 "다음에 뭘 할지"가 산문 파싱이 아니라 구조화 데이터가 되어야 자동 루프가 성립한다.

```jsonc
// pnpm harness:next --json 출력 형태
{
  "ready": [
    {
      "id": "EVAL-00XX",
      "status": "todo",
      "deps": [{ "id": "EVAL-00YY", "status": "done" }],
      "wpBranch": "feat/...",
    },
  ],
  "unblockCandidates": ["EVAL-0018"], // blocked 인데 task: blocker 전부 done — flip 은 사람 몫
  "inProgress": ["EVAL-00ZZ"],
}
```

- READY 정의는 scan-signals.mjs와 동일: depends-on 의 `task:` 토큰이 전부 `done`. 판정 로직은 `harness-lib.mjs`에 `resolveReadyTasks()`로 추출하고 scan-signals는 후속에서 이를 import한다. **왜**: 같은 판정이 두 곳에 살면 한쪽만 고쳐져 드리프트한다.
- `unblockCandidates`는 기존 `detectUnblockCandidates()` 재사용(gate/adr/spec/po 토큰 잔존 시 제외 — 기존 동작). 자동 flip 하지 않는다 — D6상 해제 결정은 사람 몫.
- `--json` 없이 실행하면 사람용 표 출력(현행 drift 스타일).
- 현재 backlog 실측: open task 전부 `blocked`·`todo` 0개 — 당분간 주 출력은 `ready`가 아니라 `unblockCandidates`다. 오케스트레이터 루프는 ready 빈 큐 + unblock 후보 존재 시 "flip 요청"을 사람에게 올리는 게 정상 경로다.

### C2 — `harness:claim <EVAL-ID>`

`Status: todo` → `in_progress` 원자 전이. finalize의 done flip과 대칭. **왜**: 상태 전이가 정식 명령이어야 추적 가능하고, 병렬 실행 시 이미 claim된 task를 두 번째 에이전트가 잡는 것을 거부로 막는다.

- 거부 케이스(exit 1): `blocked`(해제는 사람 몫) · `in_progress`(이미 claim됨) · `done` · task 미존재 · **todo지만 depends-on 미완(WAITING)**. **왜**: claim 가능 집합 = `harness:next`의 `ready` 집합으로 정확히 일치시켜 오케스트레이터가 두 명령을 교차 검증 없이 쓴다 (2026-06-12 결정).
- 성공 시 task 파일의 `Status:` 라인만 수정 — 다른 내용 무변경(외과적).
- `--force` 없음. **왜**: finalize와 달리 우회가 필요한 정상 시나리오가 없다. 정말 필요하면 task 파일 직접 수정(파일이 SoT).

### C3 — runs[] `attempts` 필드 (`oneShot` 대체)

`attempts`(양의 정수)가 기존 `oneShot`(boolean)을 **대체**한다 (2026-06-12 결정). `oneShot === (attempts === 1)`로 의미가 포함 관계라 병기는 중복이고, `oneShot`은 비검증 필드라 EVAL-0017 엔트리에서 이미 누락된 실증이 있다 — 검증 없는 필드는 새는다.

- `harness:finalize` skeleton이 `attempts: 1`을 포함하고, 재시도 후 성공 시 구현 세션이 실제 시도 횟수로 채운다. `harness:check`가 양의 정수인지 검증한다.
- **실패 종결도 append**: 3회 실패로 분할이 결정된 task는 성공 엔트리가 없으므로, 오케스트레이터가 `status: "abandoned"` + `attempts` 엔트리를 append해 oracle 증거를 보존한다. run `status`는 이미 `done` 외 값(`in_progress`, EVAL-0012)을 가지므로 스키마 자연 확장. 원 task 파일은 기존 archive 은퇴 컨벤션을 따른다(`detectUnblockCandidates`가 archive 은퇴 id를 resolved로 취급하는 동작 기존재).
- pass@3 판정: `attempts >= 3`인 run은 성공이어도 `harness:drift`가 "task 크기 검토" advisory를 낸다(자동 분할 아님 — D5 oracle은 신호이지 집행이 아니다). `abandoned`는 이미 사람이 분할을 결정한 결과라 advisory 대상이 아니다.
- 기존 runs[] 엔트리는 소급하지 않는다(append-only). check는 기존 엔트리의 `attempts` 부재·`oneShot` 잔존을 허용(grandfather)하고, 신규 엔트리부터 `attempts`를 요구한다.

### C4 — `defaultLookupBranch` 브랜치 실존 확인

선행 task의 Parent Links에서 찾은 `feat/*` 브랜치를 `git show-ref`로 실존 확인하고, 없으면 `null` 반환 → 기존 `develop` fallback을 탄다. **왜**: 머지-삭제된 브랜치를 base로 렌더하면 implementer가 시작부터 실패한다(EVAL-0017에서 실측).

- 확인 범위는 로컬 ref + `origin/*` remote-tracking ref. 네트워크 fetch는 하지 않는다. **왜**: goal 렌더는 결정론·오프라인이 원칙 — 네트워크 의존을 넣으면 같은 입력이 다른 출력을 낼 수 있다.
- 주입 가능 시그니처 유지(`renderGoalPrompt({ lookupBranch })` 패턴) — 파일시스템/git 비의존 테스트 보존.

### C5 — `implement-agent-task.md` 보강 (`.agents/**` — 사람 승인 필요)

- **커밋 권한 명문화** (2026-06-12 결정): implementer는 worktree 안에서 커밋까지 자율 수행한다. 푸시·PR 생성은 오케스트레이터가 사용자 확인 후에만. **왜**: step 6과 goal 프롬프트의 현행 충돌을 "커밋=자율 / 푸시=사람 게이트"로 해소 — worktree 내 커밋은 로컬·가역적이고, 저장소 밖으로 나가는 행위만 게이트하면 충분하다(파일럿에서 이 경계로 운영해 문제 없었음). `AGENTS.md` §8의 "자동 커밋·푸시는 사용자 확인 후에만" 규칙에 worktree 한정 예외를 같은 PR에서 명시해 문서 간 충돌을 남기지 않는다.
- **CI 모니터 단계 추가**: 푸시 후 `gh pr checks --watch`로 결론까지 감시, 실패 시 로그 확인→수정→재푸시→재감시. **왜**: 로컬 green ≠ CI green이 실측됐다(PR #216 jest 타임아웃).

### C6 — RN 도메인 리뷰어 (`.claude/agents/mobile-reviewer.md`)

`apps/mobile/**` 범위 읽기 전용 리뷰어. 핵심 가드레일: Expo Router 구조 · read service 계약(ADR-0037) · phase 분기 일원화(ADR-0027 — 표시·자격 분기는 status가 아니라 phase) · BFF Bearer 인증(ADR-0036) · RLS negative 경로. 기존 3종 리뷰어와 같은 심각도 체계(Blocker/Major/Minor).

`.claude/agents/`는 `.gitignore` 대상이므로 커밋 불요 — 팀 공유가 필요해지면 화이트리스트 추가를 별도 결정.

### C7 — task Verification 명령 작성 컨벤션 (문서 1줄)

jest `--testPathPattern`은 `src/` 앵커로 쓴다(예: `src/.*read-only`). **왜**: worktree 디렉토리명(`with-key-rn-read-only-screens`)에 task slug가 들어가 비앵커 패턴이 경로 전체에 오염된다(EVAL-0017 실측). `.agents/backlog/AGENT_TASK_TEMPLATE.md`의 Verification 블록 주석에 추가.

## Alternatives Considered

1. **`harness:claim` 없이 `finalize --force`로 우회** — 상태 전이 기록이 사라지고 병렬 잠금이 불가능. 기각.
2. **attempts를 별도 파일(`evals/results/attempts.json`)로** — runs[]가 agent log의 SoT(Single Source of Truth)인데 분산하면 parity 검증이 복잡해진다. 기각.
   - 변형안 **`oneShot` 유지 + `attempts` 병기**도 기각 — 같은 사실의 이중 기록은 한쪽만 갱신되는 drift를 부른다(`oneShot` 누락 실증이 그 증거).
   - 변형안 **성공 엔트리에만 attempts**도 기각 — 3회 실패→분할 케이스의 증거가 runs[]에 안 남아 oracle 기계 판정 목적과 모순.
3. **외부 오케스트레이터 도구(별도 러너/큐 시스템) 도입** — POC 범위 초과. 기존 CLI + 세션 오케스트레이션으로 충분하며, Phase 3에서 saved workflow/`/loop`로 상시화한다. 기각.
4. **scan-signals.mjs를 즉시 lib import로 강제 교체** — withkey-todo 스킬은 독립 동작이 가치라 hard 의존을 본 PR에 묶지 않는다. soft 후속으로 분리.

## Verification

### 명령

```bash
pnpm harness:test        # harness-lib 단위 테스트 (resolveReadyTasks · claim 전이 · lookupBranch 주입)
pnpm harness:check       # attempts 검증 포함 Tier 1 lint
pnpm harness:next --json # 실데이터 출력 눈검증
pnpm harness:verify      # 통합 (typecheck + lint + test + check + harness:test)
```

### 시나리오

- 정상: `harness:next --json`이 현재 backlog에서 `unblockCandidates: ["EVAL-0018"]`을 보고한다(blocker EVAL-0017 done 실측 상태와 일치).
- 정상: READY todo task에 `harness:claim` → Status만 in_progress로 바뀌고 다른 라인 무변경(`git diff` 1줄).
- 실패: blocked/in_progress/done task 또는 depends-on 미완(WAITING) todo에 claim → exit 1 + 사유 메시지.
- 실패: skeleton의 `attempts`를 문자열·0·음수로 채우면 `harness:check` FAIL. 신규 엔트리에 `attempts` 부재도 FAIL(기존 엔트리는 grandfather).
- 정상: `status: "abandoned"` + `attempts: 3` 엔트리가 check를 통과하고, done-run parity 검증을 깨지 않는다.
- 엣지: 선행 WP 브랜치가 로컬·`origin/*` 모두 삭제된 task의 `harness:goal` → base가 develop으로 렌더.

## Rollout

PR 2개로 분할 — 머시너리 코드와 `.agents/` 문서의 승인 게이트가 다르므로 섞지 않는다.

1. **PR-A `feat/harness-orchestration-cli`**: C1~C4 + C7(템플릿 주석) + 테스트. `scripts/**` + `package.json` 스크립트 엔트리 + `.agents/backlog/AGENT_TASK_TEMPLATE.md` 주석 1줄 — `apps/**`·`.agents/workflows/**` 무변경.
2. **PR-B `docs/harness-implement-workflow`**: C5 워크플로 문서 보강 + `AGENTS.md` §8 worktree 예외 1줄. `.agents/**` 변경이라 리뷰가 곧 D6 사람 승인.
3. C6 리뷰어는 로컬 파일 생성만(커밋 없음) — Claude Code 재시작 후 `subagent_type`으로 활성.
4. dogfood: EVAL-0018(unblock 후보)을 파이프라인 2호 run으로 돌려 새 인터페이스를 실전 검증.

### 롤백

PR-A·PR-B 각각 1 commit revert. runs[] `attempts`는 append-only 데이터라 남아도 무해(check가 grandfather 처리).

## Out of scope

- Phase 3 상시 루프 자체(saved workflow / `/loop` 정의) — 본 spec의 인터페이스가 선행 조건.
- blocked→todo 자동 flip · PR 자동 머지 — D6 절대 금지/사람 영역 유지.
- PRD·AC·게이트 값 변경 — 하네스 정책상 에이전트 불가 영역.
- `apps/mobile` jest 설정 자체 변경 — testTimeout은 PR #216에서 이미 반영.

## 용어집

- **abandoned**: pass@3 실패로 사람이 분할을 결정해 종결된 run의 `status` 값 — 성공 없이도 oracle 증거를 runs[]에 남기기 위한 신규 상태
- **D5 / D6**: `docs/migration/05-rn-harness-decisions.md`의 결정 번호 — D5는 원자 단위(1 WP=1 PR, pass@3 oracle), D6는 권한 경계 3단(자율/제안+사람/절대 금지)
- **pass@3**: 같은 task를 3회 시도해도 실패하면 task가 너무 크다는 분할 신호
- **runs[]**: `evals/results/agent-results.json`의 append-only agent 실행 로그
- **unblock 후보**: blocked task 중 `task:` blocker가 전부 done — todo flip 검토 대상(결정은 사람)
- **WP(Work Package)**: 1 worktree = 1 브랜치 = 1 PR 단위의 작업 묶음
