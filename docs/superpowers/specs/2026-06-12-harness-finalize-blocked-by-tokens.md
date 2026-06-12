---
spec: 2026-06-12-harness-finalize-blocked-by-tokens
title: Blocked-by 토큰 문법 + harness:finalize 명령
author: pistachio8
date: 2026-06-12
status: draft
---

## Summary

Agent Task(`evals/tasks/*.md`)의 `Blocked-by` · `Depends-on` frontmatter를 기계가 읽을 수 있는 토큰 문법(`[type:value]` + 자유 문장)으로 구조화하고, task 완료 처리 3단계(Status flip → runs[] append → harness:check)를 묶는 `pnpm harness:finalize EVAL-XXXX` 명령을 신설한다.

두 변경은 연결된다 — Blocked-by가 구조화되면 finalize와 drift 검사가 "이 task는 무엇에 막혀 있고, 그것이 해소됐는가"를 정규식 추측 없이 판단할 수 있다.

## Why

- `Blocked-by`는 현재 자유 문장이라 스크립트가 신뢰하고 소비할 수 없다. `harness-lib.mjs:513`은 `EVAL-\d+` **첫 매치 하나**만 worktree base branch 후보로 쓴다 — `EVAL-0005·0006`처럼 복수 선행이면 나머지가 버려진다.
- *언급*과 *의존*을 구분할 수 없다. EVAL-0022의 "EVAL-0006 선례" 같은 인용 문구 때문에, 현행 첫-매치를 전체-추출로 고치는 단순 보강(lint-only)은 인용을 의존으로 오탐한다 — 문장 해석으로는 닫히지 않는 문제.
- `Depends-on`이 이미 사실상 운영 중인데 — frontmatter 키 1개(0022) + 본문 prose 표기 2개(0028·0029) — `harness-lib`는 전혀 파싱하지 않는다. frontmatter `Depends-on`조차 `harness:goal` base branch 선정에서 무시된다.
- 선행 task가 done이 되어도 하류 blocked task가 풀렸는지 사람이 기억해야 한다. stale blocked(예: EVAL-0015 done인데 0016이 여전히 blocked)를 기계가 검출할 수 없다.
- task 완료 처리(Status flip + runs[] append)는 수동 규약이라 단계 누락이 가능하다. `harness:check` Tier 1-D · `harness:drift`가 사후 검출은 하지만, 처리 자체를 묶는 명령이 없다.

## Impact Scope

### 변경 경로

- 신규: `scripts/harness-finalize.mjs` · `package.json` script `harness:finalize`
- 수정: `scripts/harness-lib.mjs`(parseBlockers 신설 · validateTask 규칙 · Tier 1-D placeholder 확장 · renderGoalPrompt 소비처 교체) · `scripts/harness-drift.mjs`(해제 후보 advisory) · `scripts/harness-lib.spec.mjs`(테스트) · `evals/tasks/*.md`(13개 토큰 문법 마이그레이션) · `evals/results/agent-results.json`(description의 append-only 예외 문구) · `.agents/backlog/AGENT_TASK_TEMPLATE.md` · `.agents/workflows/create-agent-tasks.md` · `.agents/workflows/implement-agent-task.md`(step 6을 finalize 명령으로 치환)

### src/ 영향

없음 — 하네스 스크립트 · evals · .agents 문서만.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

### C1. 토큰 문법 (Blocked-by · Depends-on 공통)

```
Blocked-by: [task:EVAL-0005] [task:EVAL-0006] [gate:G2] — 법무 통과 후 노출. blocked 동안 테스트 작성 가능.
Depends-on: [task:EVAL-0020] [task:EVAL-0021] — intra-feature 순서(게이트 아님).
```

- `—`(em dash) 왼쪽 = `[type:value]` 토큰 나열. 오른쪽 = 자유 문장(스크립트 무시, 사람용 설명).
- 토큰 타입 5종 — **왜 5종 고정**: 현행 13개 task의 blocker를 전수 분류한 결과가 이 5종으로 닫힌다. 신규 타입은 spec 갱신으로만 추가.

| 타입    | 값 예시           | 의미                 | 해제 판단               |
| ------- | ----------------- | -------------------- | ----------------------- |
| `task:` | `EVAL-0005`       | 선행 task 완료       | 기계 (Status done 확인) |
| `gate:` | `G2`              | 외부 게이트(법무 등) | 사람                    |
| `adr:`  | `0036`            | ADR accepted 선행    | 사람                    |
| `spec:` | `analytics-union` | spec 문서 선행       | 사람                    |
| `po:`   | `retap-flow`      | PO 승인 선행         | 사람                    |

- `Blocked-by`(하드 게이트 — `Status: blocked` 동반)와 `Depends-on`(순서 의존 — Status는 todo 가능)은 같은 문법, 다른 의미. **왜 분리 유지**: EVAL-0022 선례 — intra-feature 순서를 게이트로 표기하면 착수 가능한 일이 blocked로 보인다.

### C2. 파서 · 검증 (`harness-lib.mjs`)

- `parseBlockers(line)` 신설: **첫 `—` 기준으로 먼저 자르고**(prose 안의 두 번째 `—`·토큰 인용 오탐 방지), 왼쪽에서만 `\[([a-z]+):([^\]]+)\]` 전체 추출 → `{ type, value }[]`. dash 변형(`–`·`―`·`--`)도 분리자로 수용한다(리뷰 반영 2026-06-12) — em dash 오타 시 오른쪽 prose 인용이 실제 의존으로 추출되는 silent 오염 방지. 정식 표기는 em dash 하나.
- 소비처 교체:
  - worktree base branch(`renderGoalPrompt`): 첫 `EVAL-` 정규식 → 첫 `task:` 토큰. **`Blocked-by` 우선, 없으면 `Depends-on`**. **왜 첫 토큰**: 현행 동작(첫 선행 브랜치 위에 쌓기) 보존 — 복수 base 병합은 범위 밖.
  - ADR 게이트 경고: `\bADR\b` 텍스트 매치 → `adr:` 또는 `spec:` 토큰 존재.
- `validateTask` 추가 규칙(`harness:check` 에러):
  - `Blocked-by` 또는 `Depends-on` **키가 존재하면 토큰 ≥1 필수**. **왜**: blocked 한정으로 좁히면 todo task의 `Depends-on` 구문법이 무검출로 살아남아 base branch가 조용히 develop으로 떨어진다 — "병존 기간 없음"은 이 규칙이어야 성립.
  - 알 수 없는 토큰 타입 → 에러.
  - `—` 왼쪽의 비토큰 잔여 텍스트(대문자 `[Task:]` 오타 등) → 에러. 빈 value 토큰(`[gate: ]`) → 에러(리뷰 반영 2026-06-12). **왜**: 소문자-only 토큰 정규식의 무매치는 에러가 아니라 silent drop 이라 lint 로 승격해야 잡힌다.
  - `task:` 토큰이 존재하지 않는 task 참조 → 에러. 존재 탐색은 `evals/tasks/` + `archive/` 포함. **왜**: 선행 done task가 나중에 archive 되는 순간 하류 토큰이 CI를 깨는 회귀 방지.
- `harness:drift`에 **warnings 채널(비차단)** advisory 1건 추가: blocked task의 `task:` 토큰이 전부 done이고 다른 타입 토큰이 없으면 "해제 후보 — todo로 flip?" 경고. **자동 flip 아님**(보고만). **왜**: 해제 결정은 사람/구현 세션 몫. gate/adr/spec/po 토큰이 섞이면 침묵 — 해제 판단이 사람 몫인 타입이 남아 있는 한 후보가 아니다.
- `validateDoneRunParity`(Tier 1-D) 확장: done task의 runs[] entry에 `<<FILL>>` placeholder가 남아 있으면 **에러**. **왜**: finalize의 exit 1은 프로세스가 살아있는 동안만 유효 — placeholder 채로 커밋되는 회귀는 CI 게이트(check)가 막아야 한다.

### C3. `pnpm harness:finalize EVAL-XXXX` (`scripts/harness-finalize.mjs`)

동작 순서:

1. **전제 검사** — task 존재 · `Status: in_progress` 확인. `done`은 entry 상태로 세분: ① entry에 `<<FILL>>` 잔존 → **resume**(채움 검증 재실행, `--force` 불요), ② entry 완전(placeholder 없음) → **이미 finalized — 변경 없이 step 4 검증만 수행**(멱등, check 통과면 exit 0 — 재실행이 거부로 끝나지 않는다), ③ entry 없음 → `--force` 요구. `todo`·`blocked`도 경고 후 `--force` 요구 — `--force`는 **Status 검사만 우회**하고, `Blocked-by`의 미해소 `task:` 토큰(done 아닌 선행) 거부는 우회 불가. `Depends-on`은 검사하지 않는다(soft 순서 의존 — blocked 의미가 아니므로).
2. **Status flip** — `done`이 아니면 `done`으로 파일 수정, 이미 `done`이면 no-op (resume 시 skip).
3. **runs[] append** — `evals/results/agent-results.json`에 같은 `taskId` entry가 이미 있으면 skip. 없으면 skeleton append: `taskId` · `date`(오늘) · `track` · `kind`(frontmatter 유래) · `status: "done"` 자동, `summary` · `verification` · `notes`는 `"<<FILL>>"` placeholder(채우는 주체는 구현 세션 — `verification`은 기존 runs 관례인 `{ "local": { "<명령>": "<결과>" } }` object로 교체, `notes`는 선택이라 불요 시 채우는 시점에 필드를 삭제한다. 삭제 누락 = `<<FILL>>` 잔존 = Tier 1-D 에러로 강제). **왜 skeleton**: runs[] 내용(요약·검증 로그)은 구현 세션만 쓸 수 있다 — 명령은 형태 보장만 담당. skeleton의 placeholder 채움은 "기존 항목 수정 금지"(append-only)의 **명시 예외** — 같은 PR 안에서 미커밋 placeholder를 채우는 것만 허용하며, `agent-results.json`의 description 문구도 이 예외를 포함하게 갱신한다.
4. **검증** — `pnpm harness:check` 실행. placeholder(`<<FILL>>`)가 남아 있으면 **exit 1** + "summary·verification 채운 뒤 재실행" 메시지 — 에이전트가 채우고 재실행(step 1의 resume 경로)하는 루프 유도. 영속 게이트는 finalize가 아니라 C2의 Tier 1-D 확장(placeholder 잔존 = check 에러)이 담당한다.

git 커밋 · 푸시는 하지 않는다. **왜**: 자동 커밋은 사용자 확인 후 — 기존 정책(AGENTS.md §8).

### C4. 마이그레이션 · 문서

- frontmatter `Blocked-by` / `Depends-on` 보유 task 13개를 새 문법으로 1회 일괄 변환. 변환 규칙:
  - 토큰 순서는 기존 문장 내 등장 순서 보존. **왜**: base branch가 "첫 `task:` 토큰"이므로 순서가 바뀌면 현행 동작이 깨진다.
  - 기존 줄에 이미 `—`가 있는 6개(0007·0014·0019·0022·0025·0026) 중 0019·0025·0026은 **dash 오른쪽에도 blocker 실질 정보**(spec/PO/선행 EVAL)가 있다 — 양쪽 모두에서 토큰을 합성해야 "정보 손실 없음"이 성립.
  - 해소·조건부 blocker 제외 규칙은 **사람-판단 타입(gate/adr/spec/po)에만** 적용: 조건부("if ... unresolved")·이미 해소된 것은 토큰에서 제외하고 해소 기록은 prose에 남긴다. **`task:` 토큰은 선행이 done이어도 항상 보존** — done 여부는 기계가 판단하므로, 토큰이 있어야 base branch 선정과 drift 해제-후보 advisory가 동작한다(예: 0016은 `[task:EVAL-0015]` 보존 + 해소된 D-4 adr 제외 → advisory가 "todo flip?" 후보로 잡는다).
  - 제외 결과 토큰이 0개가 되면 blocker가 더 없다는 뜻 — 해당 키를 삭제하고 `Status: blocked`면 `todo`로 flip한다(해소 기록은 본문 노트). 키 존재 + 토큰 0개는 C2 에러이므로 빈 키를 남기지 않는다.
  - 본문 prose의 Depends-on 표기(0028·0029, done)는 변환하지 않는다 — done task **본문** 편집은 "머지 후 별도 편집 금지" 규약 위반. 반면 done task의 **frontmatter 표기 변환**(0014·0022 등)은 이번 일괄 마이그레이션 PR 한정 예외 — 의미 불변(같은 사실의 표기만 변경)이라 status drift 방지라는 규약 목적을 해치지 않는다.
- 구버전 문법(토큰 없는 blocked)은 마이그레이션 후 **에러로 강제** — 두 문법 병존 기간 없음(한 PR로 종결). **왜**: 병존 허용 시 신규 task가 구문법으로 작성되는 회귀를 lint가 못 막는다.
- 템플릿(`AGENT_TASK_TEMPLATE.md`) · `create-agent-tasks.md`에 문법 명세 추가, `implement-agent-task.md` step 6을 `pnpm harness:finalize` 호출로 치환.

## Alternatives Considered

1. **prose 유지 + 기계 키 분리**(`Blocker-tasks:` 등 별도 frontmatter) — 점진 도입은 쉬우나 같은 사실이 두 줄에 존재해 drift가 구조적으로 가능. 기각.
2. **lint-only**(포맷 신설 없이 추출 정규식만 강화) — 마이그레이션 비용 0이지만 "언급 vs 의존"을 문장만으로 구분 불가(EVAL-0022 "선례" 문구 오탐 확정). 기각.
3. **finalize 확장(하류 blocked 자동 flip · 게이트 상태 config)** — 해제 판단의 절반(gate/spec/po)이 사람 몫이라 자동 flip은 오판 위험. drift advisory(보고)로 한정. 범위 축소 채택.

## Verification

### 명령

```bash
pnpm harness:test      # parseBlockers · validateTask · finalize 단위 테스트
pnpm harness:check     # 마이그레이션된 13개 task 포함 0 violations
pnpm harness:drift     # 해제 후보 advisory 동작 확인
pnpm harness:verify    # typecheck + lint + test + check + harness:test 일괄
```

### 시나리오

- 정상: `in_progress` task에 finalize → done flip + skeleton append + placeholder 안내 exit 1 → 채운 뒤 재실행 → entry 완전이므로 no-op + `harness:check` 통과 확인 → exit 0 (`--force` 불요). 일부만 채웠으면 resume 경로(①)로 다시 exit 1.
- 엣지: done + entry 완전 → no-op exit 0(멱등). done + entry 없음 → `--force` 없이는 거부. 미해소 `task:` blocker → `--force`로도 우회 불가 거부. runs[] entry 기존재 → append skip.
- 검증 회귀: 키 존재 + 토큰 0개 / 미존재 task 참조 / 미지 토큰 타입 / done인데 runs entry에 `<<FILL>>` 잔존 → `harness:check` 에러.
- base branch: frontmatter `Depends-on`만 가진 task fixture의 `renderGoalPrompt`가 선행 브랜치를 base로 잡는지(단위 테스트 — 실제 0028은 Depends-on이 본문 prose라 대상 아님). Blocked-by·Depends-on 둘 다 있으면 Blocked-by 우선.

## Rollout

1. 한 PR로 종결: parseBlockers + validateTask + finalize + 13개 task 마이그레이션 + 템플릿/워크플로 문서.
2. 다음 구현 세션부터 `implement-agent-task.md` step 6 경로로 finalize 사용 — 별도 dogfood 기간 없음(하네스 내부 도구).

### 롤백

1 commit revert — 파서·명령·task 마이그레이션이 한 커밋이라 revert 로 구문법·수동 규약으로 복귀한다. finalize 가 만든 skeleton entry 는 해당 PR 안에서만 존재하므로 revert 대상에 자연 포함, 이전 PR 들의 기존 runs[] 기록은 건드리지 않아 무손상.

## Out of scope

- 하류 blocked task 자동 flip(전파) — drift advisory 보고까지만.
- 게이트(G2 등) 상태의 기계 추적(config 파일) — 사람 판단 유지.
- 복수 `task:` 선행의 worktree base 병합 전략 — 첫 토큰 유지.
- `adr:` 토큰의 자동 해소 검사(`docs/adr/` 파일 존재·accepted 판정) — 해제 판단은 사람 유지.
- 본문 prose Depends-on 표기(0028·0029, done)의 frontmatter 승격.
- `evals/results/agent-results.json` 스키마 변경 — 기존 `schema_version` 그대로.

## 용어집

- **Agent Task(AT)**: `evals/tasks/NNNN-*.md` — 하네스가 실행 단위로 삼는 작업 명세 파일.
- **drift**: task의 Status와 실제 저장소 상태(브랜치 머지 여부 등)의 불일치. `pnpm harness:drift`가 advisory로 보고.
- **frontmatter**: markdown 파일 맨 위 `---` 블록의 `Key: value` 메타데이터. 하네스는 한 줄 key:value 커스텀 파서를 쓴다.
- **runs[]**: `evals/results/agent-results.json`의 append-only 실행 기록 배열. `Status: done` task는 entry 1건 이상 필수(Tier 1-D).
- **Work Package(WP)**: 하나의 feat 브랜치로 끝나는 작업 묶음. Agent Task와 1:1.
