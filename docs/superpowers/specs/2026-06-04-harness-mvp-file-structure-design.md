# Harness MVP — 파일 구조와 템플릿 설계 (spec)

**Date**: 2026-06-04
**Status**: draft
**Author**: pistachio8 (PO)
**연관**: [ADR-0031](../../adr/0031-harness-structure-agents-home.md) (하네스 구조 결정) · [05-rn-harness-decisions](../../migration/05-rn-harness-decisions.md) (D1~D12) · [AGENTS.md](../../../AGENTS.md)

> 이 스펙은 [ADR-0031](../../adr/0031-harness-structure-agents-home.md)이 정한 구조(`.agents/` 단일 머시너리 홈 + 인스턴스는 docs/evals + engineering/migration 포인터)를 **실제 MVP 파일 목록과 템플릿 전문**으로 구체화한다. 코드는 구현하지 않는다 — 이 스펙이 구현 단계(writing-plans 이후)의 입력이다.

## 1. Summary

PWA→RN 전환 하네스를 **지금 repo에 바로 넣을 수 있는 최소 파일 집합**으로 구체화한다. 머시너리는 tool-agnostic `.agents/`에, 인스턴스는 기존 `docs/`·`evals/`에 둔다. Codex·Claude·Cursor가 동일하게 쓸 수 있도록 진입점은 `AGENTS.md → .agents/README.md`, 워크플로는 평문 markdown, 검증은 pnpm CLI다. Prompt 3 제네릭 템플릿의 신규 가치(Harness Impact Questions·Plugin/Native adapter·config.json·DECISION_NEEDED)는 채택하되, ADR-0031과 충돌하는 부분(engineering 본문 복제·`.harness/` 별도 홈·`.sh` 스크립트·docs/decisions 중복)은 적응한다.

## 2. Why

- [05](../../migration/05-rn-harness-decisions.md)·[ADR-0031](../../adr/0031-harness-structure-agents-home.md)이 *결정*과 *구조*를 닫았으나, 실제 파일·템플릿이 없어 에이전트가 따라 돌 대상이 없다.
- `evals/`는 "설치만 하고 못 쓰던" 자산 — Agent Task·drift를 여기 얹어 활성화한다.
- **Codex 동시 사용 요구**(PO): 하네스가 Claude 전용에 묶이면 안 된다 → tool-agnostic 진입점·워크플로·CLI 검증이 1급 요구.

## 3. Impact Scope

| 영역 | 변경 |
|---|---|
| 신규 디렉토리 | `.agents/{pm/templates,pm/raw,engineering,migration,backlog,qa,workflows,harness/config,harness/workflows,harness/reports/proposals}` · `docs/eng-stories/` · `evals/{drift-reports,meta}` |
| 신규 파일 | 템플릿·워크플로·정책 (아래 §4.3 목록) |
| 수정 | `AGENTS.md`(하네스 라우팅 1섹션) · `package.json`(harness:* 스크립트) · `scripts/new-doc.mjs`(PM 타입) · `evals/README.md`(Kind 규칙) |
| src/ | **없음** (코드 구현 아님) |
| Supabase/RLS | **없음** |
| 외부 서비스 | **없음** |

## 4. Design

### 4.1 MVP 하네스 개요

완성형 시스템이 아니라 **실제 프로젝트에 바로 넣고 도는 최소 하네스**다. 세 축:

1. **Product/Engineering/Migration 분리**(원칙 3) — pm/(제품) · engineering INDEX(포인터) · migration INDEX(포인터).
2. **추적성 spine**(원칙 4) — PRD AC → Test Scenario → Job Story → Engineering Story → Work Package → Agent Task가 frontmatter `Parent`로 위로 1줄씩 인용.
3. **self-maintaining**(원칙 7·8) — drift 감지 + update proposal, 단 승인 없이 제품 방향·핵심 아키텍처 변경 금지(3단 권한).

### 4.2 최종 디렉토리 구조

`★`=§4.4~4.7 전문 수록 · `→포인터`=본문 복제 안 함.

```text
AGENTS.md                              # 기존 + "하네스 라우팅" 섹션 (Codex 자동로드 진입점)

.agents/
  README.md                            # 하네스 인덱스 = tool-agnostic 진입점
  pm/
    PRODUCT_CONTEXT.md                 # 싱글톤 — docs/IDEATION·strategy·PRD §1 정규화 + 포인터
    PM_PLUGIN_ADAPTER.md               # ★ Plugin Mode / Native Mode
    templates/{PRD,TEST_SCENARIO,JOB_STORY,ENGINEERING_STORY,ACCEPTANCE_CRITERIA}_TEMPLATE.md
    raw/.gitkeep                       # PM 플러그인 raw 출력 격리
  engineering/INDEX.md   →포인터       # .claude/rules/* · 04 · ARCHITECTURE · BE_SCHEMA
  migration/INDEX.md     →포인터       # 03(매핑 SoT) · 00 · 05
  backlog/
    WORK_PACKAGE_TEMPLATE.md           # WP=PR 컨벤션 + PR본문 shape
    AGENT_TASK_TEMPLATE.md             # ★ evals/tasks frontmatter 확장본
    TRACEABILITY.md                    # 매트릭스=harness:report 생성물 설명
  qa/
    DOGFOOD_QA_PLAN_TEMPLATE.md · RELEASE_CHECKLIST.md
  workflows/                           # tool-agnostic 절차 SoT (9)
    create-prd · create-test-scenarios · create-job-stories · create-engineering-stories
    split-work-packages · create-agent-tasks★ · implement-agent-task★ · review-agent-task · fix-verification
  harness/
    HARNESS_MAINTENANCE.md · UPDATE_POLICY.md★ · DRIFT_CHECKLIST.md · DECISION_NEEDED.md · CHANGELOG.md
    config/harness.config.example.json ★
    workflows/{check-harness-drift★, propose-harness-update★, review-harness-update, apply-harness-update}.md
    reports/proposals/.gitkeep

docs/eng-stories/README.md             # Engineering Story 집 + 템플릿 (05 D10)

scripts/harness-check.mjs★ · harness-drift.mjs    # pnpm(=verify.sh 대체), 결정론 Tier 1
package.json                           # harness:check / harness:drift / harness:verify
evals/tasks/                           # 기존 — RN Agent Task 0004+ (frontmatter 확장)
evals/drift-reports/.gitkeep · evals/meta/.gitkeep
```

### 4.3 파일별 상세 (경로 · 목적 · 읽는 workflow · 업데이트 시점)

| 경로 | 목적 | 읽는 workflow | 업데이트 시점 |
|---|---|---|---|
| `.agents/README.md` | 하네스 인덱스·진입점 | (모든 도구 진입) | 디렉토리 추가/이동 시 (Level 1) |
| `.agents/pm/PRODUCT_CONTEXT.md` | 제품 맥락 정규화 요약 | create-prd | 제품 방향 변경 시 (Level 3 — PO) |
| `.agents/pm/PM_PLUGIN_ADAPTER.md` | PM 산출물 normalize 계약 | create-prd, create-test-scenarios, create-job-stories | PM 도구 도입/계약 변경 (Level 2) |
| `.agents/pm/templates/*` | 제품 아티팩트 템플릿 | create-* | 아티팩트 계약 변경 (Level 2) |
| `.agents/engineering/INDEX.md` | 엔지니어링 규칙 포인터 | implement-agent-task, review-agent-task | 가리키는 파일 경로 변경 (Level 1) |
| `.agents/migration/INDEX.md` | 전환 규칙 포인터(03=SoT) | create-agent-tasks(port), implement-agent-task | 03 갱신·매핑 추가 (Level 2) |
| `.agents/backlog/WORK_PACKAGE_TEMPLATE.md` | WP=PR 본문 shape | split-work-packages | WP 정책 변경 (Level 2) |
| `.agents/backlog/AGENT_TASK_TEMPLATE.md` | Agent Task 스키마 | create-agent-tasks, implement-agent-task | 태스크 스키마 변경 (Level 2+meta-eval) |
| `.agents/backlog/TRACEABILITY.md` | 추적 매트릭스 생성 규칙 | (harness:report) | 추적 규칙 변경 (Level 2) |
| `.agents/qa/DOGFOOD_QA_PLAN_TEMPLATE.md` | dogfood QA 계획 | (Release 단계) | QA 전략 변경 (Level 2) |
| `.agents/qa/RELEASE_CHECKLIST.md` | 릴리스 게이트 | review-agent-task, (Release) | 배포 전략 변경 (Level 3 — PO) |
| `.agents/workflows/*` (9) | 도구 중립 절차 SoT | (에이전트 직접) | 절차 변경 (Level 2) |
| `.agents/harness/HARNESS_MAINTENANCE.md` | 자기유지 개요·인덱스 | check-harness-drift | 자기유지 구조 변경 (Level 2) |
| `.agents/harness/UPDATE_POLICY.md` | 3단 권한 + meta-eval | propose/review/apply-harness-update | 권한 경계 변경 (Level 2+meta-eval 자기참조) |
| `.agents/harness/DRIFT_CHECKLIST.md` | 7 drift 유형 점검표 | check-harness-drift | drift 기준 변경 (Level 2) |
| `.agents/harness/DECISION_NEEDED.md` | PO 대기 결정 로그(θ/G2/04§9) | propose-harness-update | 미결정 추가/해소 시 |
| `.agents/harness/CHANGELOG.md` | 하네스 변경 이력 | (모든 harness workflow) | 하네스 변경마다 (Level 1) |
| `.agents/harness/config/harness.config.example.json` | harness:check/drift 설정 | check-harness-drift, harness:check | 경로·게이트·임계 변경 |
| `docs/eng-stories/README.md` | Engineering Story 집·템플릿 | create-engineering-stories | Eng Story 작성 시 |
| `scripts/harness-check.mjs` | 결정론 Tier 1 검증 | `pnpm harness:check` | 검증 규칙 변경 (Level 2+meta-eval) |

### 4.4 핵심 템플릿 전문

#### `.agents/pm/PM_PLUGIN_ADAPTER.md`

```markdown
# PM Plugin Adapter

PM 산출물을 하네스 표준 포맷으로 들여오는 어댑터. 두 모드(Plugin / Native)가 있고,
**Normalized PRD 이후 backlog pipeline은 두 모드가 동일**하다(원칙 4·D8).

## 핵심 계약 (하드 의존 — 도구가 아니라 아티팩트 모양에 의존)
- PRD: 각 Feature에 `AC-<feature>-<n>` (측정 가능한 수용 기준)
- Job Story: situation / motivation / outcome
- Test Scenario: Given / When / Then + expected
- Acceptance Criteria: pass/fail 판정 가능
- Risks / Assumptions: 각 항목에 영향·완화

## Plugin Mode
pm-execution / pm-skills-ko 등으로 만든 raw 산출물을 normalize.

입력(raw) → `.agents/pm/raw/`에 그대로 저장:
- raw PRD / raw Job Stories / raw Test Scenarios / raw Acceptance Criteria / raw Risks·Assumptions

normalize 규칙:
1. 각 raw 파일에 표준 헤더 부여 — `Source: <tool> <date>`, AC에 `AC-<feature>-<n>` ID.
2. spine 인용 슬롯 — Job/TS가 어느 PRD AC에서 나왔는지 `Parent: PRD-AC-<id>`.
3. 트랙 슬롯 — 각 Feature에 `Track: port|greenfield`(미정이면 `TBD`, create-agent-tasks에서 확정).
4. 도구 메타·민감정보 제거.

출력(normalized):
- `.agents/pm/prd.md`
- `.agents/pm/job-stories.md`
- `.agents/pm/test-scenarios.md`
- `.agents/pm/acceptance-criteria.md`
- `.agents/pm/risks-assumptions.md`

## Native Mode (플러그인 없음)
`.agents/pm/templates/*`를 직접 채워 같은 5개 출력을 만든다(`pnpm new prd|job-story|...`).
port 트랙은 POC PRD(`docs/PRD.md`·`docs/migration/01`)가 이미 있어 **PRD 생성 자체가 불필요** —
기존 PRD를 normalized 입력으로 인용만 한다.

## 두 모드 공통 이후 (backlog pipeline)
normalized PRD → create-test-scenarios → create-job-stories → create-engineering-stories
→ split-work-packages → create-agent-tasks. 여기서부터 플러그인 사용 여부와 무관.

## 절대 금지
CI/headless에서 pm-skills를 *필수 런타임 스텝*으로 호출(D8). 부재 시 Native Mode fallback.

## 읽는 workflow / 업데이트 시점
read: create-prd · create-test-scenarios · create-job-stories.
update: PM 도구 도입/교체, 아티팩트 계약 변경(Level 2).
```

#### `.agents/backlog/AGENT_TASK_TEMPLATE.md`

````markdown
---
# evals/tasks/NNNN-<slug>.md frontmatter — harness:check 가 파싱
Task: EVAL-<feature>-<slug>
Track: port | greenfield          # D2 — PR 템플릿·헤더에 강제 노출
Kind: migration | regression       # migration=닫히는 work-unit, regression=영속 baseline
Status: todo | blocked | in_progress | done
Blocked-by: <해제조건, 예: G1-PoC θ 확정>   # blocked 일 때만
---

# <Task ID>: <한 줄 결과>

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)
- Parent PRD Feature: <PRD-AC-id> (docs/migration/01 또는 docs/PRD.md)
- Parent Test Scenario: <TS-id>
- Parent Job Story: <JS-id> (docs/stories/...)
- Parent Engineering Story: <ES-id> (docs/eng-stories/...)
- Parent Work Package: <WP-id> (브랜치 feat/rn-<feature>)

## Goal
<이 태스크가 끝나면 무엇이 참이 되나 — 한 문단>

## Source Files to Inspect
<읽을 기존 파일 경로 — 컨텍스트>

## Target Files
<만들/고칠 파일 경로>

## Requirements
<반드시 충족할 동작 — bullet>

## Non-goals
<이 태스크가 건드리지 않는 것 — scope 봉인, 원칙 6>

## Acceptance Criteria
<pass/fail eval 기준 = Test Scenario 흡수(D10). 결정론 우선>

## Verification Commands
```bash
pnpm typecheck && pnpm lint && pnpm test -- <scope>
# 해당 시: pnpm test -- <capability>   (capability eval)
```

## Expected Output Summary
<에이전트가 끝나고 남길 한 문단 요약의 모양>

## Harness Impact Questions (완료 시 반드시 답 — drift 루프 입력, 원칙 7)
1. Did this task introduce a new folder structure?
2. Did this task introduce a new naming convention?
3. Did this task introduce a new dependency?
4. Did this task change verification commands?
5. Did this task reveal that the current harness instructions are outdated?
6. Should any `.agents/` document (templates · workflows · harness policy/config) be updated?
   # (Prompt 3 원문의 `.harness`는 본 하네스에서 `.agents/harness/`로 접힘 — ADR-0031)
→ 하나라도 yes면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition (원칙 5)
- 모든 Acceptance Criteria green + Verification 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할
  (에이전트 무능/프롬프트 문제 1회 점검 후, 05 §9.4).
````

### 4.5 핵심 workflow 전문

모든 워크플로는 `Goal / Read First / Inputs / Process / Output Format / Stop Condition` 형식. 평문 markdown이라 Claude는 `.claude/commands/` 래퍼로, Codex는 파일을 직접 읽어 실행.

#### `.agents/workflows/create-agent-tasks.md`

```markdown
# Workflow: create-agent-tasks

## Goal
Work Package 1개를 에이전트 1패스로 실행 가능한 Agent Task 1~N개로 분해.

## Read First
- .agents/README.md · .agents/backlog/AGENT_TASK_TEMPLATE.md
- .agents/migration/INDEX.md (port) 또는 .agents/engineering/INDEX.md (greenfield)
- 해당 Engineering Story (docs/eng-stories/) · 05 D2·D5

## Inputs
- Work Package 1개 (Engineering Story가 spawn) · 트랙 태그(port|greenfield)

## Process
1. WP를 레이어 슬라이스로 쪼갬(1 feature/api 또는 1 capability = 1 AT 휴리스틱).
2. **port/greenfield 비혼합**(원칙 9·D2) — 포팅 AT와 신기능 AT를 다른 파일로.
3. 각 AT에 Parent 5종·Non-goals·AC·Verify·Harness Impact Q 채움.
4. greenfield θ/G2 의존 AT는 Status: blocked + Blocked-by 명시(D12).
5. evals/tasks/NNNN-<slug>.md 로 저장(0004부터, append-only 번호).

## Output Format
evals/tasks/NNNN-*.md (AGENT_TASK_TEMPLATE 따름).

## Stop Condition
- WP의 모든 동작이 AT로 커버 + 각 AT가 Verify 가능 + 트랙 태그 100%.
```

#### `.agents/workflows/implement-agent-task.md`

```markdown
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
5. Harness Impact Questions 6개 답변. yes 있으면 evals/drift-reports/에 노트.

## Output Format
변경 파일 목록 + Expected Output Summary + Harness Impact 답변 + Verify 결과.

## Stop Condition
- AT의 Stop Condition 충족. 3회 실패 시 분할 신호(create-agent-tasks 재호출).
- Claude: /implement-agent-task(.claude/commands 래퍼) · Codex: 이 파일을 읽고 따름.
```

#### `.agents/harness/UPDATE_POLICY.md`

```markdown
# Harness Update Policy (self-maintaining ≠ self-directing, 원칙 8)

하네스는 drift report·update proposal을 만들 수 있으나, 승인 없이 제품 방향·핵심
아키텍처를 바꾸지 못한다. 변경을 3단으로 게이트(Prompt 3 Level 1/2/3 = 05 D6).

## Level 1 — 자동 업데이트 (하네스 자율)
경로명 반영 · package script 이름 반영 · CHANGELOG 업데이트 · 완료 task 상태 ·
traceability 링크 보정. → harness:drift 감지 + apply-harness-update 자동 PR, 사람 머지.

## Level 2 — 제안만 (PR + meta-eval + 사람)
layer 구조 · feature/capability 경계 · task 크기 정책 · 새 dependency 표준 ·
testing strategy. → propose-harness-update가 PR 초안, meta-eval 통과 후 사람 승인.

## Level 3 — 자동 변경 절대 금지 (PO 전용)
PRD goal · MVP scope · 신규 핵심 기능 추가/삭제 · non-goal · 비즈니스 모델 ·
배포 전략 · **eval 수용기준(계약)**. → 하네스는 "PRD는 X, 코드는 Y" 깃발만.

## 비대칭 원칙 (05 §6.1)
코드 ↔ *의도 문서*(PRD/Story) drift = 항상 "코드 의심" 기본값(세탁 경로 없음).
코드 ↔ *서술 문서*(README) drift만 자동 노트 안전.

## meta-eval — 하네스 자기변경 게이트 (D11)
mechanics diff(.agents/** · evals/** · .claude/rules/** · docs/migration/02~05):
1. strengthen | neutral | weaken 분류(결정론).
2. weaken 1건이라도 → ADR + PO 승인 + reason-code, auto-merge 차단. strengthen/neutral 자유.
3. weaken reason-code enum: THRESHOLD_LOWERED · TOLERANCE_WIDENED · EVAL_REMOVED ·
   EVAL_DISABLED · SEVERITY_DOWNGRADED · SOT_PRECEDENCE_RELAXED · AUTONOMY_EXPANDED ·
   APPROVAL_GATE_NARROWED.
4. 같은 reason-code 반복(×3) → 체계적 침식 PO 경보.

## 읽는 workflow / 업데이트 시점
read: propose/review/apply-harness-update.
update: 권한 경계 자체 변경 = Level 2 + meta-eval 자기참조(AUTONOMY_EXPANDED 등).
```

#### `.agents/harness/workflows/check-harness-drift.md`

```markdown
# Workflow: check-harness-drift

## Goal
7개 drift 유형을 점검해 읽기전용 drift report 생성(해소 아님 — 깃발만, 원칙 7).

## Read First
- .agents/harness/DRIFT_CHECKLIST.md · harness/config/harness.config.json · 05 §7

## Inputs
- 시점: Define-time | Record-time | 주기 sweep
- 변경 diff(Record-time) 또는 전체 그래프(sweep)

## Process — 7 drift 유형
1. Architecture Drift — 레이어/경계 위반(feature가 expo-* 직접 import 등)
2. Rule Drift — .claude/rules ↔ 코드 괴리
3. Task Granularity Drift — pass@3 반복 실패 누적
4. Verification Drift — 보존 eval red 뒤집힘 / 게이트 우회
5. Product Drift — 코드 ↔ PRD 의도 괴리 → [HUMAN REVIEW]
6. Dependency Drift — expo/pkg 표준 이탈
7. Traceability Drift — 인용 경로/AC 소멸(hallucinated-path)

결정론 floor 우선(Tier 1): validate:docs · 인용 resolve · 보존 eval · AnalyticsEvent parity.
모델 보조(Tier 2)는 sweep에서만 [HUMAN REVIEW] 플래그.

## Output Format
evals/drift-reports/<date>.md (append-only).
각 항목: {유형, Tier, Level(UPDATE_POLICY), 위치, 제안}.

## Stop Condition
- 모든 유형 점검 완료. 결정론 불일치 0 또는 전부 report됨. 명령: pnpm harness:drift.
```

#### `.agents/harness/workflows/propose-harness-update.md`

```markdown
# Workflow: propose-harness-update

## Goal
drift report를 받아 update proposal(PR 초안) 생성. 승인 없이 적용 안 함(원칙 8).

## Read First
- 대상 drift report(evals/drift-reports/) · .agents/harness/UPDATE_POLICY.md

## Inputs
- drift 항목 1~N

## Process
1. 각 항목을 Level 1/2/3 분류(UPDATE_POLICY).
2. Level 1 → apply-harness-update 자동 PR 후보 표시.
3. Level 2 → 제안 + meta-eval 분류(strengthen/neutral/weaken).
   weaken이면 reason-code + ADR 필요 + auto-merge 차단.
4. Level 3 → 제안 금지, DECISION_NEEDED.md에 PO 항목 등록.
5. .agents/harness/reports/proposals/<date>-<slug>.md 로 저장.

## Output Format
proposal: {대상, Level, meta-eval 결과, diff 요약, 승인 필요자, reason-code(weaken 시)}.

## Stop Condition
- 모든 drift 항목이 proposal 또는 DECISION_NEEDED로 라우팅됨.
```

### 4.6 verification script

검증 게이트는 도구에 박지 않고 pnpm CLI로 둔다(Codex·CI 동일 실행). Prompt 3의 `verify.sh`는 repo 컨벤션(pnpm·`.mjs`)으로 래핑.

```js
// scripts/harness-check.mjs
// 결정론 Tier 1 하네스 검증 (drift 아님 — 구조·추적성 lint).
// 실행: pnpm harness:check · 종료코드 0=pass, 1=fail.
// 본 스펙은 계약·골격만 정의. 실제 구현은 빌드 단계(Out of scope §8).
import { readFileSync, readdirSync } from 'node:fs'
// 1. .agents/harness/config/harness.config.json 로드
// 2. evals/tasks/*.md frontmatter 파싱 → Track·Parent 존재 검사
// 3. Parent 인용(PRD AC / Story 파일) 경로 resolve (hallucinated-path = Traceability drift)
// 4. 위반 모으기 → stderr 출력 + process.exit(위반 ? 1 : 0)
```

```jsonc
// package.json "scripts" 추가분
{
  "harness:check":  "node scripts/harness-check.mjs",
  "harness:drift":  "node scripts/harness-drift.mjs",
  "harness:verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm harness:check"
}
```

### 4.7 `.agents/harness/config/harness.config.example.json`

```jsonc
{
  "version": "0.1",
  "project": "fromwith-rn",
  "paths": {
    "pm": ".agents/pm",
    "engineeringIndex": ".agents/engineering/INDEX.md",
    "migrationIndex": ".agents/migration/INDEX.md",
    "engStories": "docs/eng-stories",
    "jobStories": "docs/stories",
    "agentTasks": "evals/tasks",
    "driftReports": "evals/drift-reports",
    "metaEval": "evals/meta",
    "decisions": "docs/adr",
    "specs": "docs/superpowers/specs"
  },
  "tracks": {
    "port":       { "preserveEval": true,  "passK": "100%" },
    "greenfield": { "preserveEval": false, "passAt": 3 }
  },
  "gates": {
    "ledger_invariant": { "kind": "deterministic", "active": true },
    "idempotency":      { "kind": "deterministic", "active": true },
    "false_flag_rate":  { "kind": "threshold", "theta": null, "active": false, "blockedBy": "G1-PoC" },
    "legal_signoff":    { "kind": "boolean", "value": false, "blockedBy": "G2-legal" }
  },
  "drift": {
    "anchors": ["define", "record", "sweep"],
    "tier1Deterministic": ["validate-docs", "citation-resolve", "preserve-eval", "analytics-parity"],
    "tier2Model": { "enabled": true, "onlyDuring": "sweep" }
  },
  "sotPrecedence": ["PRD", "EngineeringStory", "JobStory"],
  "metaEval": {
    "mechanicsPaths": [".agents/**", "evals/**", ".claude/rules/**", "docs/migration/0[2-5]*"],
    "weakenReasonCodes": ["THRESHOLD_LOWERED","TOLERANCE_WIDENED","EVAL_REMOVED","EVAL_DISABLED","SEVERITY_DOWNGRADED","SOT_PRECEDENCE_RELAXED","AUTONOMY_EXPANDED","APPROVAL_GATE_NARROWED"],
    "recurrenceAlertThreshold": 3
  }
}
```

> `theta: null` · `legal_signoff.value: false`는 [05 D12](../../migration/05-rn-harness-decisions.md) 게이트 파라미터화 — G1 PoC·G2 법무 통과 시 주입. 그 전까지 의존 task는 `blocked`.

### 4.8 PM plugin optional adapter 사용법

```text
# Plugin Mode (pm-skills 있음)
1. pm-execution / pm-skills-ko 로 raw 산출물 생성
2. .agents/pm/raw/ 에 저장
3. create-prd 워크플로 → PM_PLUGIN_ADAPTER normalize 규칙 적용 → .agents/pm/*.md
4. 이후 create-test-scenarios → ... → create-agent-tasks (동일 pipeline)

# Native Mode (pm-skills 없음 / port 트랙)
1. .agents/pm/templates/* 직접 작성 (pnpm new prd|job-story|...)
   (port 트랙은 docs/PRD.md·docs/migration/01 인용만, 새 PRD 불필요)
2. 이후 동일 pipeline
```

### 4.9 하네스 drift check 사용법

```bash
pnpm harness:check    # 결정론 Tier 1 — 추적성·구조 lint (Define/Record-time, CI)
pnpm harness:drift    # 7 drift 유형 점검 → evals/drift-reports/<date>.md
# 주기 sweep(마일스톤/주1회): harness:drift + Tier 2 모델 보조 [HUMAN REVIEW]
# 제안: propose-harness-update → .agents/harness/reports/proposals/
# 적용: Level 1 자동(apply) / Level 2 사람 / Level 3 DECISION_NEEDED.md
```

### 4.10 Codex 사용법 (tool-agnostic)

```text
진입점:  AGENTS.md(자동로드) → "하네스 라우팅" 섹션 → .agents/README.md
워크플로: .agents/workflows/*.md 평문 markdown 직접 읽고 실행
         (Claude는 /command 래퍼, Codex는 "X 워크플로를 따라라" 또는 ~/.codex/prompts)
검증:    pnpm harness:* (도구 무관 CLI)
금지:    워크플로를 .claude/commands/ 에만 두기(=Codex 배제), pm-skills 필수 호출(=CI 깨짐)
```

## 5. Alternatives Considered

구조 대안은 [ADR-0031](../../adr/0031-harness-structure-agents-home.md)에서 결정됨(`.agents/` 단일 홈 vs 기존 접기 vs 본문 복제). 본 스펙은 그 결정을 파일로 구체화하며, 추가 대안은 없다. Prompt 3 verbatim(engineering 본문 복제·`.harness/` 별도 홈)은 ADR Alt #3로 기각됨.

## 6. Verification

- `pnpm validate:docs` — 본 스펙·INDEX·README 내부 링크 resolve.
- 구현 단계 산출물에 대해: `pnpm harness:check`(추적성), `pnpm harness:verify`(typecheck→lint→test→check).
- Codex smoke: `AGENTS.md → .agents/README.md → workflows/*` 경로를 Codex 세션에서 읽어 1개 워크플로 dry-run.

## 7. Rollout (실제 프로젝트 적용 순서 = 다음 단계)

[ADR-0031 후속 영향](../../adr/0031-harness-structure-agents-home.md) + 05 §9.2를 7일로:

1. `docs/eng-stories/README.md` + Eng Story 템플릿 · 02·03·04→05 back-ref.
2. `.agents/README.md` + `pm/templates/*` + `PM_PLUGIN_ADAPTER.md` + `pm/raw/`.
3. `engineering/INDEX.md` · `migration/INDEX.md`(포인터) + `AGENTS.md` 하네스 섹션.
4. `workflows/*`(하류 5종 먼저: create-agent-tasks·implement·review·fix-verification·create-engineering-stories).
5. `evals/tasks/` frontmatter 확장 + `evals/README.md` Kind 규칙 + `scripts/new-doc.mjs` PM 타입.
6. `harness/`(UPDATE_POLICY·DRIFT_CHECKLIST·DECISION_NEEDED·config) + `harness:check`·`harness:drift` + `evals/{drift-reports,meta}`.
7. TRACEABILITY 수동 시드(P0 9개) + 첫 마일스톤 sweep.

## 8. Out of scope

- `scripts/harness-check.mjs`·`harness-drift.mjs`·`harness-report`의 **실제 구현**(본 스펙은 계약·골격만 — writing-plans 이후 코드 단계).
- Tier 2 모델 grader·`harness:report` 풀 렌더.
- RN 워크스페이스 scaffold 후 활성화되는 `expo-doctor` 와이어링.
- 범용 하네스 추출(D1 rule-of-three — 두 번째 프로젝트 시).
- D9·D12 ADR / D11 meta-eval spec 승급(별도 후속, 05 §9.3).

## 9. 용어집

- **머시너리 / 인스턴스**: 하네스를 돌리는 것(템플릿·워크플로·정책) / 하네스가 만든 것(PRD·Story·Task).
- **tool-agnostic**: 특정 도구에 안 묶임. `.agents/`·`AGENTS.md`·pnpm은 tool-agnostic, `.claude/`는 Claude 전용.
- **Plugin Mode / Native Mode**: PM 플러그인으로 raw 생성 후 normalize / 템플릿 직접 작성. normalized PRD 이후 동일 pipeline.
- **Harness Impact Questions**: Agent Task 완료 시 답하는 6개 질문 — 변경이 하네스를 outdated하게 했는지 drift 루프에 입력.
- **drift / drift report**: 아티팩트가 서로 어긋난 상태 / 그 어긋남을 깃발 꽂는 읽기전용 산출물(7 유형).
- **meta-eval**: 하네스 자기변경이 게이트·기준을 *약화*시키는지 탐지하는 단방향 장치(품질 판정 아님, D11).
- **Level 1/2/3**: 자동 / 제안+사람 / PO 전용 — 하네스 변경 3단 권한(원칙 8 = D6).
- **port / greenfield 트랙**: 포팅(보존 baseline 있음) / 신기능(없음). Verify 게이트가 다름(D2).
- **G1 / G2 / θ**: 부정탐지 PoC / 법무 / false-flag 임계. 통과 전 의존 task는 `blocked`(D12).
