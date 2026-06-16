# Runbook: full-pipeline (PM → 무인 /goal)

제품 아이디어부터 코드 구현까지, 하네스의 워크플로 10개를 **한 줄로 엮은 실행 순서**다.
각 단계의 절차 본문은 해당 워크플로 파일이 SoT(Single Source of Truth, 단일 원본) — 여기서는
**순서·명령·표면만** 깐다(본문 복제 금지, ADR-0031). 도구 무관: Claude·Codex 공통.

> 진입점 맵은 [`../README.md`](../README.md) "작업 종류 → workflow 매핑" 참조.

## 표면 범례 (명령을 어디에 입력하나)

- **[셸]** — 터미널(`pnpm …`). 일반 셸 명령.
- **[프롬프트]** — Claude/Codex 입력창(`/goal …`·`/pm-execution:…`). 셸 아님 — `$(...)` 치환 불가.
- **[에이전트]** — 서브에이전트 위임(예: `harness-engineer`).

## 무인(unattended)이 적용되는 범위

**"무인"은 Stage 4(구현) 뿐이다.** Stage 1~3(PM·분해)은 문서를 만들고 사람이 검토·승인하는
창작 단계라 무인이 아니다. 그리고 무인이라도 Stage 4는 **push/PR 직전에서 정지**한다 —
D6(사람 게이트, [05-rn-harness-decisions](../../docs/migration/05-rn-harness-decisions.md))는 절대 경계다.
즉 **무인 = "툴 호출마다 승인 안 함"이지 "사람 없이 머지까지"가 아니다.** **왜**: 검토 없는 자동
push·merge 는 되돌리기 비용이 큰 outward 행위라 사람 게이트로 남긴다.

---

## Stage 0 — PM 플러그인 설치 (최초 1회, 있으면 스킵)

선택적 외부 도구다. `/pm-execution:*` 스킬이 이미 보이면 건너뛴다. 설치는 사용자 결정 —
임의 설치 금지([`../pm/PM_PLUGIN_ADAPTER.md`](../pm/PM_PLUGIN_ADAPTER.md) §플러그인 출처).

```bash
# [셸]
claude plugin marketplace add lucas-flatwhite/pm-skills-ko
claude plugin install pm-execution@pm-skills
# → 세션 재시작 (플러그인 스킬은 다음 세션부터 로드)
```

## Stage 1 — PM raw 산출물 생성

PM 스킬로 raw 초안을 만들어 `.agents/pm/raw/` 에 저장한다. port 트랙은 `docs/PRD.md` 가
이미 있어 PRD 생성 자체가 불필요(기존 PRD 인용만).

```text
# [프롬프트]
/pm-execution:create-prd          → raw PRD
/pm-execution:job-stories         → raw Job Stories
/pm-execution:test-scenarios      → raw Test Scenarios
/pm-execution:pre-mortem          → raw Risks·Assumptions
```

**사람**: 각 산출물 검토(측정 가능한 AC 인가).

## Stage 2 — 정규화 (raw → 하네스 표준 포맷)

raw 를 표준 헤더·`AC-<feature>-<n>` ID·`Parent: PRD-AC-<id>` 슬롯으로 정규화한다.
규칙 SoT 는 [`../pm/PM_PLUGIN_ADAPTER.md`](../pm/PM_PLUGIN_ADAPTER.md) §normalize.

```text
# [프롬프트/에이전트]
"PM_PLUGIN_ADAPTER 따라 .agents/pm/raw/ 정규화"
#   산출: docs/stories/<date>-<feature>-job-stories.md (job-story spine 홈)
#         docs/pm/{prd,test-scenarios,acceptance-criteria,risks-assumptions}.md
```

**사람 게이트**: AC 측정 가능성 PO 확인.

## Stage 3 — 백로그 분해 (Story → WP → Agent Task)

엔지니어링 스토리부터 Agent Task(AT)까지 분해한다. `harness-engineer` 서브에이전트가
워크플로를 fresh 로 읽어 `pnpm harness:check` PASS 까지 자체 루프한다.

- 절차 SoT: [`create-engineering-stories.md`](create-engineering-stories.md) →
  [`split-work-packages.md`](split-work-packages.md) → [`create-agent-tasks.md`](create-agent-tasks.md)

```text
# [에이전트]
"harness-engineer 로 <feature> 엔지니어링 스토리부터 Agent Task 까지 분해"
#   결과: docs/eng-stories/*.md · evals/tasks/NNNN-*.md (append-only 번호)
```

```bash
# [셸] 분해 결과 구조·추적성 검증
pnpm harness:check     # open task 의 /goal 프롬프트 ≤4000자 포함 (초과 시 FAIL)
```

**사람 게이트**: 새 `spec`/`adr` 필요·`po` 승인이면 정지. `blocked → todo` flip 은 사람 몫(D6).

---

## Stage 4 — 무인 /goal 구현 루프

`evals/tasks/` 의 task 를 **한 개씩** 구현한다. 절차 SoT 는
[`implement-agent-task.md`](implement-agent-task.md)(검증 실패 시 [`fix-verification.md`](fix-verification.md) 분기).
ID 는 `claim`·`goal`·`finalize` 전부 **동일** 해야 한다 — claim 이 만든 `in_progress` 를 finalize 가 `done` 으로 닫는 대칭이라, 다르면 한쪽이 방치된다.

```bash
# [셸] 4-1. 착수 가능 task 확인
pnpm harness:next

# [셸] 4-2. task 1개 claim (예: EVAL-0030) — todo→in_progress 원자 전이
pnpm harness:claim EVAL-0030

# [셸] 4-3. /goal 프롬프트 렌더 → 출력 전체 복사
pnpm harness:goal EVAL-0030
```

```text
# [프롬프트] 4-4. 자동 실행 — 4-3 출력을 붙여넣기
/goal <붙여넣기>
#   루프 자동: 분석(context) → 구현 → 검증 green(pass@3) → 실패수정 → 리뷰 → finalize(로그)
#   ⛔ push/PR 직전 정지·보고 (D6)
```

```bash
# [셸] 4-5. (루프가 로그 누락했을 때만) 완료 + runs[] 기록
pnpm harness:finalize EVAL-0030    # <<FILL>> 뜨면 agent-results.json summary·verification 채우고 재실행

# [셸] 4-6. (선택) 넓은 회귀 재확인
pnpm harness:verify                # typecheck · lint · test · check · harness:test
```

**사람**: 리뷰 확인 후 `git push`·PR 생성(D6 — 자동 안 함). → 다음 task 는 4-1 로 반복.

> 인터랙티브 대안: `/goal` 은 사람이 켜는 자동 모드다. 메인 에이전트에게 직접
> "EVAL-0030 claim·구현·finalize 까지(push 직전 정지)" 라고 시키면 같은 루프를 inline 으로 돈다.

---

## 한눈에 보는 흐름

```
[Stage 1-3] 사람+에이전트 — 문서 만들고 검토 (무인 아님)
 PM 스킬 → 정규화 → 분해(harness:check)
        │  evals/tasks/ 에 Agent Task 적재
        ▼
[Stage 4] 무인 /goal — task 단위 반복
 next → claim → goal → /goal(분석·구현·검증·수정·로그 자동) → ⛔정지 → 사람 push/PR
        ↑______________________________________________________│ 다음 task
```

## 무인 모드 사전 세팅 (Stage 4 마찰 제거)

`/goal` 은 로컬 Claude/Codex 세션에서 돈다 — 별도 서버 불필요. 무인 흐름이 끊기지 않게
`.claude/settings.local.json` 의 `permissions.allow` 에 아래 2줄을 더한다.

```jsonc
"Bash(pnpm harness:*)",
"Bash(git worktree *)"
```

**사람이 직접** 추가해야 한다 — 에이전트가 자기 권한을 넓히는 셀프 수정은 안전장치가 막는다.
가장 쉬운 길: 그냥 한번 돌려 보고, 권한 프롬프트가 뜨면 "항상 허용" 선택(정식 학습 경로).
`--dangerously-skip-permissions` 는 금지([`../../.claude/rules/web/hooks.md`](../../.claude/rules/web/hooks.md)) — allowlist 로만.

## 꼭 기억할 3가지

1. **"무인"은 Stage 4 뿐** — 앞단은 창작·승인이라 사람이 같이 한다.
2. **번호 통일** — `claim`·`goal`·`finalize` 전부 같은 `EVAL-XXXX`.
3. **무인이라도 push 직전 정지** — 누락이 아니라 D6 안전장치.

## 용어집

- **AC**: Acceptance Criteria — pass/fail 판정 가능한 수용 기준.
- **AT**: Agent Task — 에이전트 1패스로 구현 가능한 최소 작업 단위(`evals/tasks/NNNN-*.md`).
- **D6**: 05-rn-harness-decisions 의 결정 6 — push·PR·merge·spec·adr·po 는 사람 게이트(절대 경계).
- **pass@3**: 검증을 3회 시도 안에 green 으로 — 못 만들면 task 과대로 보고 분할.
- **PM**: Product Management — 제품 요구·스토리 산출(여기선 pm-execution 플러그인 스킬).
- **SoT**: Single Source of Truth — 중복 없이 기준으로 삼는 단일 원본.
- **WP**: Work Package — 1 worktree = 1 PR 단위의 기능 슬라이스.
- **무인(unattended)**: 툴 호출마다 사람 승인을 받지 않는 실행 모드(머지까지 자동이 아님).
