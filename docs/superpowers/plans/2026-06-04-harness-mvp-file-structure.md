# Harness MVP — 파일 구조와 템플릿 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [spec 2026-06-04-harness-mvp-file-structure-design](../specs/2026-06-04-harness-mvp-file-structure-design.md)이 정한 MVP 하네스 파일 집합(`.agents/` 머시너리 + `docs/eng-stories` + `evals/` 확장 + `pnpm harness:*` wire-up)을 repo에 실제로 생성한다.

**Architecture:** 머시너리(템플릿·워크플로·정책)는 tool-agnostic `.agents/`에, 인스턴스(PRD·Story·Agent Task)는 기존 `docs/`·`evals/`에 둔다([ADR-0031](../../adr/0031-harness-structure-agents-home.md)). 엔지니어링·마이그레이션 규칙은 복제하지 않고 INDEX 포인터로 가리킨다. 검증은 도구 무관 pnpm CLI. **harness-\*.mjs 스크립트의 실제 구현은 spec §8 Out of scope** — 본 계획은 정직한 skeleton stub만 만든다(거짓 green 방지 배너 + exit 0).

**Tech Stack:** Markdown(평문 워크플로·템플릿·정책) · Node.js ESM `.mjs`(scaffold·검증 스크립트) · JSON(config) · pnpm scripts.

---

## 왜 이 순서인가 (필독 — task 순서를 결정하는 단일 제약)

`pnpm validate:docs`(`scripts/validate-doc-paths.mjs`)는 **파일명이 정확히 `README.md`·`AGENTS.md`·`CLAUDE.md`인 파일만** 스캔하고, 그 안의 markdown 링크·backtick 경로(`/` 포함 + 알려진 확장자)·`@import`가 실제로 resolve되는지 검사한다. 템플릿 패턴(`<` `>` `{` `}` `*` 포함)은 검사에서 제외된다.

따라서:

- **스캔 대상(이 계획이 건드리는 것)**: `.agents/README.md`(신규) · `docs/eng-stories/README.md`(신규) · `AGENTS.md`(수정) · `evals/README.md`(수정).
- `INDEX.md`·`*_TEMPLATE.md`·워크플로 `.md`·harness 정책 `.md`·`.json`·`.mjs`는 **스캔되지 않는다**.
- 그래서 **진입점 README/AGENTS는 자신이 가리키는 파일이 이미 존재한 뒤에 작성**해야 한다. 계획은 leaf(템플릿·워크플로·harness·스크립트)부터 만들고, README/AGENTS를 마지막에 만든다(bottom-up). 이렇게 하면 매 커밋에서 `validate:docs`가 green을 유지한다.

검증 순서 기본값: `pnpm typecheck && pnpm lint && pnpm test` 는 markdown/JSON만 추가하는 task에서는 영향이 없다(코드 미변경). 스크립트·package.json·new-doc.mjs를 건드리는 task(8·9)에서만 typecheck/lint를 돌린다. `validate:docs`는 스캔 대상 README/AGENTS를 건드리는 task(10~14)에서 돌린다.

---

## File Structure

`★` = spec에 전문(全文)이 있어 그대로 옮김 · `(seed)` = spec §4.3.1 seed를 본 계획이 완성 본문으로 확장 · `(skeleton)` = §8 Out of scope라 stub만.

```text
.agents/
  README.md                      # (seed) tool-agnostic 진입점 — 작업종류→workflow 매핑     [SCANNED]
  pm/
    PRODUCT_CONTEXT.md            # (seed) 제품 맥락 정규화 요약(싱글톤)
    PM_PLUGIN_ADAPTER.md          # ★ Plugin/Native Mode normalize 계약
    raw/.gitkeep                  # PM 플러그인 raw 출력 격리
    templates/
      PRD_TEMPLATE.md             # (seed) AC-<feature>-<n> 포함
      TEST_SCENARIO_TEMPLATE.md   # (seed) Given/When/Then
      JOB_STORY_TEMPLATE.md       # (seed) situation/motivation/outcome
      ENGINEERING_STORY_TEMPLATE.md # (seed) 시스템 언어 작업-서사
      ACCEPTANCE_CRITERIA_TEMPLATE.md # (seed) pass/fail
  engineering/INDEX.md            # (seed) 규칙 포인터(본문 복제 금지)
  migration/
    INDEX.md                      # (seed) 03=전환 규칙 SoT 포인터
    REVIEW_CHECKLIST.md           # (seed) 포팅 PR 리뷰 체크박스
  backlog/
    WORK_PACKAGE_TEMPLATE.md      # (seed) WP=PR 본문 shape
    AGENT_TASK_TEMPLATE.md        # ★ evals/tasks frontmatter 확장본
    TRACEABILITY.md               # (seed) 매트릭스 생성 규칙
  qa/
    DOGFOOD_QA_PLAN_TEMPLATE.md   # (seed)
    RELEASE_CHECKLIST.md          # (seed)
  workflows/                      # 도구 중립 절차 SoT (9)
    create-prd.md                 # (seed)
    create-test-scenarios.md      # (seed)
    create-job-stories.md         # (seed)
    create-engineering-stories.md # (seed)
    split-work-packages.md        # (seed)
    create-agent-tasks.md         # ★
    implement-agent-task.md       # ★
    review-agent-task.md          # (seed)
    fix-verification.md           # (seed)
  harness/
    HARNESS_MAINTENANCE.md        # (seed) 자기유지 개요·인덱스
    UPDATE_POLICY.md              # ★ 3단 권한 + meta-eval
    DRIFT_CHECKLIST.md            # (seed) 7 drift 유형
    DECISION_NEEDED.md            # (seed) PO 대기 결정 로그
    CHANGELOG.md                  # (seed) 하네스 변경 이력(초기 엔트리)
    config/harness.config.example.json # ★
    workflows/
      check-harness-drift.md      # ★
      propose-harness-update.md   # ★
      review-harness-update.md    # (seed)
      apply-harness-update.md     # (seed)
    reports/proposals/.gitkeep

docs/eng-stories/README.md        # (seed) Engineering Story 집·템플릿 포인터          [SCANNED]

scripts/
  harness-check.mjs               # (skeleton) pnpm harness:check
  harness-drift.mjs               # (skeleton) pnpm harness:drift
  harness-summarize-diff.mjs      # (skeleton) pnpm harness:summarize-diff
  harness-context.mjs             # (skeleton) pnpm harness:context
  new-doc.mjs                     # 수정 — PM 타입 5종 추가

package.json                      # 수정 — harness:* 스크립트 5종
AGENTS.md                         # 수정 — "하네스 라우팅" 섹션                        [SCANNED]
evals/
  README.md                       # 수정 — Kind 규칙 + frontmatter 확장 안내           [SCANNED]
  drift-reports/.gitkeep
  meta/.gitkeep

docs/migration/{02,03,04}-*.md    # 수정 — 05 back-ref 1줄(consistency debt, ADR-0031 #6)
```

각 파일은 단일 책임(템플릿 1종 / 워크플로 1절차 / 정책 1축)을 갖는다. 파일이 함께 변하는 것끼리(pm 템플릿, harness 정책)는 같은 디렉토리·같은 task로 묶었다.

---

## Task 1: PM 템플릿 5종 + raw 격리

제품 아티팩트 템플릿. `pnpm new`(Task 9)가 `.agents/pm/templates/`를 template source로 읽으므로 `{{date}}`·`{{title}}`·`{{author}}`·`{{topic}}` 치환 placeholder를 쓴다. 작성자가 채울 자리는 `<...>`(validate:docs·new-doc 모두 그대로 둠).

**Files:**

- Create: `.agents/pm/templates/PRD_TEMPLATE.md`
- Create: `.agents/pm/templates/TEST_SCENARIO_TEMPLATE.md`
- Create: `.agents/pm/templates/JOB_STORY_TEMPLATE.md`
- Create: `.agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md`
- Create: `.agents/pm/templates/ACCEPTANCE_CRITERIA_TEMPLATE.md`
- Create: `.agents/pm/raw/.gitkeep`

- [ ] **Step 1: `PRD_TEMPLATE.md` 작성**

```markdown
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

| 항목              | 영향   | 완화   |
| ----------------- | ------ | ------ |
| <risk/assumption> | <영향> | <완화> |

## 5. 추적성

- 상위: <docs/migration/01-rn-mvp-prd.md 또는 docs/PRD.md 인용>
- 하위 spawn: Test Scenario · Job Story (create-test-scenarios · create-job-stories)

## Track

- port | greenfield (보존 baseline 유무 — Verify 게이트 분기, D2). 미정이면 `TBD`, create-agent-tasks에서 확정.
```

- [ ] **Step 2: `TEST_SCENARIO_TEMPLATE.md` 작성**

```markdown
---
test-scenario: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
---

# Test Scenarios: {{title}}

> Given / When / Then + expected. PRD AC와 1:1. 신규 기능은 Agent Task eval 수용기준으로 흡수된다(D10) — 이 파일은 작성 보조용이고 최종 SoT는 eval task.

## Parent

- PRD AC: <AC-<feature>-<n>>

## Scenarios

### TS-<feature>-1 (← AC-<feature>-1)

- **Given** <전제 상태>
- **When** <행동>
- **Then** <결과>
- **expected**: <관측 가능한 기대값(결정론 우선)>
```

- [ ] **Step 3: `JOB_STORY_TEMPLATE.md` 작성**

```markdown
---
job-story: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
---

# Job Stories: {{title}}

> "When [상황], I want [동기], so [결과]." 사용자 언어(감정·상황). 테이블·RPC 같은 시스템 용어 금지 — 그건 Engineering Story (05 §1.2 경계 판별식).

## Parent

- PRD AC: <AC-<feature>-<n>>

## Stories

### JS-<feature>-1

- **When** <상황>
- **I want** <동기>
- **so** <결과>
```

- [ ] **Step 4: `ENGINEERING_STORY_TEMPLATE.md` 작성**

```markdown
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
- 직교 결정(인용만 — 본문 복제 아님): <docs/adr/NNNN-_.md 또는 docs/superpowers/specs/_>

## 서사 (지을 일 + 엔지니어링 왜)

<시스템이 무엇이 되어야 하나 + 제약/근거. 테이블·RPC·불변식 수준으로.>

## Work Packages (spawn)

- WP1: <1 worktree = 1 PR 단위로 응집된 기능>
- WP2: <...>

## Track

- port | greenfield (보존 baseline 유무 — D2)
```

- [ ] **Step 5: `ACCEPTANCE_CRITERIA_TEMPLATE.md` 작성**

```markdown
---
acceptance-criteria: {{date}}-{{topic}}
title: {{title}}
author: {{author}}
date: {{date}}
status: draft
---

# Acceptance Criteria: {{title}}

> pass/fail 판정 가능한 수용 기준 모음. 결정론 우선. Agent Task eval 수용기준의 입력.

## Parent

- PRD AC: <AC-<feature>-<n>>

## Criteria

- [ ] `AC-<feature>-1` — <측정 가능 기준> · 검증: <명령/방법>
- [ ] `AC-<feature>-2` — <...>
```

- [ ] **Step 6: `pm/raw/.gitkeep` 생성**

빈 파일. PM 플러그인 raw 출력을 격리하는 디렉토리를 git에 고정.

```bash
mkdir -p .agents/pm/raw && touch .agents/pm/raw/.gitkeep
```

- [ ] **Step 7: 생성 확인**

Run: `ls .agents/pm/templates/ && ls -a .agents/pm/raw/`
Expected: 5개 `*_TEMPLATE.md` + `.gitkeep` 표시.

- [ ] **Step 8: Commit**

```bash
git add .agents/pm/templates/ .agents/pm/raw/.gitkeep
git commit -m "feat(harness): PM 아티팩트 템플릿 5종 + raw 격리 추가"
```

---

## Task 2: PM_PLUGIN_ADAPTER + PRODUCT_CONTEXT

PM 산출물을 하네스 표준 포맷으로 들이는 어댑터(★ spec §4.4 전문)와 제품 맥락 싱글톤(seed).

**Files:**

- Create: `.agents/pm/PM_PLUGIN_ADAPTER.md`
- Create: `.agents/pm/PRODUCT_CONTEXT.md`

- [ ] **Step 1: `PM_PLUGIN_ADAPTER.md` 작성 (spec §4.4 전문 그대로)**

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

- [ ] **Step 2: `PRODUCT_CONTEXT.md` 작성 (seed 완성본)**

```markdown
# Product Context (싱글톤)

> 제품 맥락을 정규화한 요약. create-prd 워크플로가 첫 입력으로 읽는다. 본문 복제 금지 — 기존 SoT를 인용·요약만 한다(ADR-0031).

## 한 줄 정의

fromwith — 그룹 운동 각서(서약) 앱. 모바일 웹 PWA POC → React Native 전환.

## 정규화 요약 (인용 SoT — 본문은 아래 파일이 진실)

- 아이디어 / 배경: `docs/IDEATION.md`
- 전략: `docs/strategy/`
- 제품 정의 SoT: `docs/PRD.md` §1 (POC) · `docs/migration/01-rn-mvp-prd.md` (RN MVP — P0 포팅 + P1 정산 + P2 자동검증)

## 제품 방향 변경 시

이 파일 수정은 Level 3(PO 전용 — `harness/UPDATE_POLICY.md`). 하네스 자율 변경 금지. 제품 방향 drift는 항상 "코드 의심"이 아니라 PO 의식적 갱신으로만 해소(05 §5·§6).

## 읽는 workflow / 업데이트 시점

read: create-prd.
update: 제품 방향 변경 시(Level 3 — PO).
```

- [ ] **Step 3: 확인 + Commit**

Run: `ls .agents/pm/*.md`
Expected: `PM_PLUGIN_ADAPTER.md` · `PRODUCT_CONTEXT.md`

```bash
git add .agents/pm/PM_PLUGIN_ADAPTER.md .agents/pm/PRODUCT_CONTEXT.md
git commit -m "feat(harness): PM_PLUGIN_ADAPTER(normalize 계약) + PRODUCT_CONTEXT 추가"
```

---

## Task 3: engineering / migration INDEX 포인터

규칙 본문을 복제하지 않고 기존 SoT를 가리키는 얇은 포인터(ADR-0031 §3 D-R2) + 포팅 PR 리뷰 체크리스트.

**Files:**

- Create: `.agents/engineering/INDEX.md`
- Create: `.agents/migration/INDEX.md`
- Create: `.agents/migration/REVIEW_CHECKLIST.md`

- [ ] **Step 1: `engineering/INDEX.md` 작성**

```markdown
# Engineering INDEX (포인터 — 본문 복제 금지, ADR-0031)

> 엔지니어링 규칙의 SoT를 가리키기만 한다. 여기에 규칙 본문을 쓰지 않는다 — 복제 즉시 두 SoT가 갈라져 drift 1순위 표면이 된다.

| 주제                     | SoT                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| RN 타깃 아키텍처         | `docs/migration/04-rn-architecture.md` · `docs/ARCHITECTURE.md`                     |
| BE 스키마 / RLS          | `docs/BE_SCHEMA.md` · `docs/BE_SCHEMA_RLS.md`                                       |
| 코딩 스타일              | `.claude/rules/common/coding-style.md` · `.claude/rules/typescript/coding-style.md` |
| 테스트                   | `.claude/rules/common/testing.md` · `.claude/rules/typescript/testing.md`           |
| 에러 / 입력 검증         | `.claude/rules/common/coding-style.md` §파일 구성·에러·입력 검증                    |
| API / Server Action 경계 | `AGENTS.md` §3 §아키텍처 · `docs/QUALITY_GATE.md` §아키텍처 가드레일                |
| 상태 관리                | `.claude/rules/web/patterns.md` §State Management                                   |
| DoD(완료 정의)           | `docs/QUALITY_GATE.md` §공통 성공 기준                                              |

읽는 workflow: implement-agent-task · review-agent-task.
업데이트 시점: 가리키는 파일 경로가 이동/이름변경될 때만 (Level 1).
```

- [ ] **Step 2: `migration/INDEX.md` 작성**

```markdown
# Migration INDEX (포인터 — 03 = 전환 규칙 SoT)

> RN 전환 규칙의 SoT를 가리킨다. 본문 복제 금지(ADR-0031).

- 전환 규칙 SoT(레이어별): `docs/migration/03-rn-migration-rules.md`
- 인벤토리(무엇을 재사용/재작성하나): `docs/migration/00-rn-conversion-plan.md`
- 하네스 결정(D1~D12): `docs/migration/05-rn-harness-decisions.md`

## 규율

- **port / greenfield 비혼합**(원칙 9·D2): 포팅 AT와 신기능 AT를 다른 파일로 둔다. 혼합 금지 — 보존 eval 적용 트랙이 갈리므로 한 파일에 섞으면 회귀가 샌다.

읽는 workflow: create-agent-tasks(port) · implement-agent-task.
업데이트 시점: 03 갱신·매핑 추가 시 (Level 2).
```

- [ ] **Step 3: `migration/REVIEW_CHECKLIST.md` 작성**

```markdown
# Migration PR 리뷰 체크리스트 (포팅 트랙)

> 03 전환 규칙의 *적용*을 PR에서 확인하는 체크박스. 03 규칙 본문 복제가 아니다(ADR-0031).

- [ ] PR에 `Track=port` 태그 노출
- [ ] 보존 eval pass^k = 100% (회귀 0)
- [ ] feature가 `expo-*` 를 직접 import하지 않음 (도메인 격리)
- [ ] RSC · cache · hydration 잔재 없음 (RN 타깃에 무의미한 PWA 잔재 제거)
- [ ] `docs/migration/03-rn-migration-rules.md` 레이어 매핑 준수
- [ ] Parent 인용(PRD AC → Test Scenario → Job Story → Engineering Story → Work Package) 모두 resolve

읽는 workflow: review-agent-task(port).
업데이트 시점: 전환 규칙 변경 시 (Level 2).
```

- [ ] **Step 4: 확인 + Commit**

Run: `ls .agents/engineering/ .agents/migration/`
Expected: `engineering/INDEX.md` · `migration/INDEX.md` · `migration/REVIEW_CHECKLIST.md`

```bash
git add .agents/engineering/INDEX.md .agents/migration/
git commit -m "feat(harness): engineering·migration INDEX 포인터 + 포팅 리뷰 체크리스트"
```

---

## Task 4: backlog 템플릿 (Work Package · Agent Task · Traceability)

WP=PR 본문 shape, Agent Task 스키마(★ spec §4.4 전문), 추적 매트릭스 생성 규칙.

**Files:**

- Create: `.agents/backlog/WORK_PACKAGE_TEMPLATE.md`
- Create: `.agents/backlog/AGENT_TASK_TEMPLATE.md`
- Create: `.agents/backlog/TRACEABILITY.md`

- [ ] **Step 1: `WORK_PACKAGE_TEMPLATE.md` 작성**

```markdown
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
```

- [ ] **Step 2: `AGENT_TASK_TEMPLATE.md` 작성 (spec §4.4 전문 그대로 — frontmatter 포함)**

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

- [ ] **Step 3: `TRACEABILITY.md` 작성**

```markdown
# Traceability (매트릭스 = 생성물, 체크인 안 함)

> 추적 매트릭스(Test Scenario → PRD AC → Story → eval task → 상태)는 `harness:report`의 **생성 출력**이지 체크인 SoT가 아니다(ADR-0031 §6). 체크인하면 또 하나의 drift 표면이 된다.

## spine 인용 규칙 (원칙 4 — 위로 1줄씩)

Agent Task → Engineering Story → Job Story → PRD AC. 각 노드 frontmatter `Parent`에 상위 1개를 인용한다.

## 매트릭스 생성 규칙 (harness:report가 따름)

- 행 = `evals/tasks/*.md`
- 열 = Track · Parent PRD AC · Parent Story · Status · Verify 통과 여부
- hallucinated-path(resolve 안 되는 인용) = Traceability drift (Tier 1 결정론, `harness:check`)

읽는 주체: `harness:report`(생성) · `harness:check`(인용 resolve 검증).
업데이트 시점: 추적 규칙 변경 (Level 2).
```

- [ ] **Step 4: 확인 + Commit**

Run: `ls .agents/backlog/`
Expected: `WORK_PACKAGE_TEMPLATE.md` · `AGENT_TASK_TEMPLATE.md` · `TRACEABILITY.md`

```bash
git add .agents/backlog/
git commit -m "feat(harness): backlog 템플릿 — Work Package·Agent Task 스키마·Traceability"
```

---

## Task 5: QA 템플릿 (dogfood QA plan · release 체크리스트)

**Files:**

- Create: `.agents/qa/DOGFOOD_QA_PLAN_TEMPLATE.md`
- Create: `.agents/qa/RELEASE_CHECKLIST.md`

- [ ] **Step 1: `DOGFOOD_QA_PLAN_TEMPLATE.md` 작성**

```markdown
# Dogfood QA Plan 템플릿

> 릴리스 전 dogfood QA 계획. 버그 리포트는 #qa 채널에 모은다.

## 대상 / 기간

- 빌드: <preview URL / RN build 식별자>
- 기간: <YYYY-MM-DD ~ YYYY-MM-DD>

## 핵심 플로우 체크 (모바일 viewport)

- [ ] 로그인 → 보호 라우트 → 로그아웃
- [ ] <기능별 happy path>
- [ ] <실패 / 빈 / 오류 상태>

## 리포트

- 채널: #qa
- 형식: {재현 절차 · 기대 · 실제 · 환경}

읽는 단계: Release.
업데이트 시점: QA 전략 변경 (Level 2).
```

- [ ] **Step 2: `RELEASE_CHECKLIST.md` 작성**

```markdown
# Release 체크리스트 (게이트)

> 배포 전 통과 게이트. 배포 전략 자체 변경은 PO 전용(Level 3).

- [ ] 모든 Agent Task Stop Condition green
- [ ] `pnpm harness:verify` 통과 (typecheck · lint · test · check)
- [ ] 보존 eval pass^k = 100% (port 트랙)
- [ ] capability eval pass@3 (greenfield 트랙)
- [ ] G1 / G2 게이트 상태 확인 (`.agents/harness/DECISION_NEEDED.md`)
- [ ] Rollback 경로 문서화

읽는 workflow: review-agent-task · Release.
업데이트 시점: 배포 전략 변경 (Level 3 — PO).
```

- [ ] **Step 3: 확인 + Commit**

Run: `ls .agents/qa/`
Expected: `DOGFOOD_QA_PLAN_TEMPLATE.md` · `RELEASE_CHECKLIST.md`

```bash
git add .agents/qa/
git commit -m "feat(harness): QA dogfood plan·release 체크리스트 템플릿"
```

---

## Task 6: 워크플로 9종 (도구 중립 절차 SoT)

모든 워크플로는 `Goal / Read First / Inputs / Process / Output Format / Stop Condition` 형식(spec §4.5). `create-agent-tasks` · `implement-agent-task`는 spec §4.5 전문 그대로, 나머지 7개는 같은 형식의 완성본.

**Files:**

- Create: `.agents/workflows/create-prd.md`
- Create: `.agents/workflows/create-test-scenarios.md`
- Create: `.agents/workflows/create-job-stories.md`
- Create: `.agents/workflows/create-engineering-stories.md`
- Create: `.agents/workflows/split-work-packages.md`
- Create: `.agents/workflows/create-agent-tasks.md`
- Create: `.agents/workflows/implement-agent-task.md`
- Create: `.agents/workflows/review-agent-task.md`
- Create: `.agents/workflows/fix-verification.md`

- [ ] **Step 1: `create-prd.md`**

```markdown
# Workflow: create-prd

## Goal

제품 맥락 → 표준 PRD(측정 가능한 AC 포함) 생성/정규화.

## Read First

- .agents/pm/PRODUCT_CONTEXT.md · .agents/pm/PM_PLUGIN_ADAPTER.md · .agents/pm/templates/PRD_TEMPLATE.md

## Inputs

- Plugin Mode: .agents/pm/raw/ 의 raw PRD / Native Mode: PRODUCT_CONTEXT + 템플릿
- port 트랙: 기존 docs/PRD.md · docs/migration/01 인용(새 PRD 불필요)

## Process

1. raw 있으면 PM_PLUGIN_ADAPTER normalize 규칙 적용, 없으면 템플릿 직접 작성.
2. 각 Feature에 `AC-<feature>-<n>` 측정 가능 기준 부여.
3. Track 슬롯(port|greenfield|TBD) · Parent(상위 PRD 인용) 채움.
4. .agents/pm/prd.md 로 출력(port면 기존 PRD 인용으로 대체).

## Output Format

normalized PRD — Feature별 AC + Risks/Assumptions.

## Stop Condition

- 모든 Feature가 측정 가능한 AC를 가짐 + Track 슬롯 채워짐.
```

- [ ] **Step 2: `create-test-scenarios.md`**

```markdown
# Workflow: create-test-scenarios

## Goal

PRD AC → Given/When/Then Test Scenario. 최종 SoT는 Agent Task eval 수용기준(D10).

## Read First

- normalized PRD(.agents/pm/prd.md) · .agents/pm/templates/TEST_SCENARIO_TEMPLATE.md · PM_PLUGIN_ADAPTER

## Inputs

- PRD AC 1~N

## Process

1. 각 AC를 Given/When/Then + expected로 표현(AC와 1:1).
2. Parent: PRD-AC-<id> 인용.
3. docs/stories/<date>-<feature>-test-scenarios.md 로 저장(기존 컨벤션).

## Output Format

TS-<feature>-<n> 목록, 각 AC에 매핑.

## Stop Condition

- 모든 AC가 1개 이상 Test Scenario로 커버됨.
```

- [ ] **Step 3: `create-job-stories.md`**

```markdown
# Workflow: create-job-stories

## Goal

PRD AC → 사용자 언어 Job Story(누가·왜).

## Read First

- normalized PRD · .agents/pm/templates/JOB_STORY_TEMPLATE.md · PM_PLUGIN_ADAPTER

## Inputs

- PRD AC 1~N

## Process

1. "When [상황], I want [동기], so [결과]" 형식. 시스템 용어 금지(그건 Engineering Story).
2. Parent: PRD-AC-<id>.
3. docs/stories/<date>-<feature>-job-stories.md 로 저장.

## Output Format

JS-<feature>-<n> 목록.

## Stop Condition

- 각 핵심 AC가 사용자 의도로 표현됨.
```

- [ ] **Step 4: `create-engineering-stories.md`**

```markdown
# Workflow: create-engineering-stories

## Goal

Job Story / PRD → Engineering Story(시스템이 무엇이 되어야 하나 + 엔지니어링 왜). 1 ES → N Work Package.

## Read First

- docs/stories/ Job Story · normalized PRD · .agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md · .agents/engineering/INDEX.md · docs/migration/05-rn-harness-decisions.md §1.2

## Inputs

- Job Story + PRD AC

## Process

1. 시스템 언어(테이블·RPC·RLS·불변식)로 작업-서사 작성.
2. 직교 결정 인용(spec/ADR) — 본문 복제 아님.
3. Work Package들 spawn(1 worktree/PR 단위).
4. Track 태그(port|greenfield).
5. docs/eng-stories/<date>-<feature>.md 로 저장.

## Output Format

ES-<feature> + Work Package 목록 + Parent/직교 인용.

## Stop Condition

- ES가 Work Package로 분해됨 + 모든 인용 resolve + Track 태그.
```

- [ ] **Step 5: `split-work-packages.md`**

```markdown
# Workflow: split-work-packages

## Goal

Engineering Story → Work Package(1 worktree = 1 PR) 분해.

## Read First

- 대상 Engineering Story · .agents/backlog/WORK_PACKAGE_TEMPLATE.md · docs/migration/05-rn-harness-decisions.md §4

## Inputs

- Engineering Story 1개

## Process

1. 응집된 기능 슬라이스 = 1 Work Package = 브랜치 feat/rn-<feature>.
2. 각 WP에 포함될 Agent Task 후보 식별(create-agent-tasks 입력).
3. port/greenfield 비혼합(원칙 9) — 한 WP는 한 트랙.

## Output Format

WP-<feature> 목록(브랜치 · Track · 상위 ES · Agent Task 후보).

## Stop Condition

- ES의 모든 작업이 WP로 커버됨 + 각 WP가 단일 트랙.
```

- [ ] **Step 6: `create-agent-tasks.md` (spec §4.5 전문 그대로)**

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

evals/tasks/NNNN-\*.md (AGENT_TASK_TEMPLATE 따름).

## Stop Condition

- WP의 모든 동작이 AT로 커버 + 각 AT가 Verify 가능 + 트랙 태그 100%.
```

- [ ] **Step 7: `implement-agent-task.md` (spec §4.5 전문 그대로)**

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

- [ ] **Step 8: `review-agent-task.md`**

```markdown
# Workflow: review-agent-task

## Goal

구현된 Agent Task를 머지 전 리뷰. CRITICAL/HIGH 없으면 Approve.

## Read First

- 대상 AT 파일 · 변경 diff · .agents/engineering/INDEX.md · (port면) .agents/migration/REVIEW_CHECKLIST.md · docs/QUALITY_GATE.md §리뷰 기준

## Inputs

- Agent Task 1개 + 그 변경 diff

## Process

1. QUALITY_GATE 리뷰 기준 적용(보안·RLS·경계·zod SoT·에러처리·범위).
2. port 트랙 → REVIEW_CHECKLIST 6항목 확인.
3. Acceptance Criteria green + Verification 통과 확인.
4. 심각도 분류(CRITICAL/HIGH/MEDIUM/LOW).

## Output Format

리뷰 결과: 심각도별 이슈 목록 + Approve/Block.

## Stop Condition

- CRITICAL/HIGH 0건 → Approve. 있으면 fix-verification로.
- Claude: /review 래퍼 · Codex: 이 파일을 읽고 따름.
```

- [ ] **Step 9: `fix-verification.md`**

```markdown
# Workflow: fix-verification

## Goal

Verify 실패(red) 또는 리뷰 이슈를 green으로 수정.

## Read First

- 실패한 Verification 로그 · 대상 AT · .agents/engineering/INDEX.md

## Inputs

- red 검증 결과 또는 리뷰 이슈 1~N

## Process

1. 실패 원인 분류: 코드 버그 vs 테스트 오류 vs AT 과대(pass@3).
2. 코드 수정(Non-goals 봉인, surgical).
3. Verification 재실행 → green.
4. 3회 실패 시 분할 신호(create-agent-tasks 재호출, 05 §9.4).

## Output Format

수정 diff + 재검증 결과.

## Stop Condition

- 모든 Verification green + 리뷰 이슈 해소.
- Claude: /check 래퍼 · Codex: 이 파일을 읽고 따름.
```

- [ ] **Step 10: 확인 + Commit**

Run: `ls .agents/workflows/ | wc -l`
Expected: `9`

```bash
git add .agents/workflows/
git commit -m "feat(harness): 도구 중립 workflow 9종 (create-* · implement · review · fix)"
```

---

## Task 7: harness 자기유지 (정책·체크리스트·config·harness 워크플로)

self-maintaining 머시너리. `UPDATE_POLICY` · `check-harness-drift` · `propose-harness-update` · `config`는 spec 전문 그대로, 나머지는 완성본.

**Files:**

- Create: `.agents/harness/HARNESS_MAINTENANCE.md`
- Create: `.agents/harness/UPDATE_POLICY.md`
- Create: `.agents/harness/DRIFT_CHECKLIST.md`
- Create: `.agents/harness/DECISION_NEEDED.md`
- Create: `.agents/harness/CHANGELOG.md`
- Create: `.agents/harness/config/harness.config.example.json`
- Create: `.agents/harness/workflows/check-harness-drift.md`
- Create: `.agents/harness/workflows/propose-harness-update.md`
- Create: `.agents/harness/workflows/review-harness-update.md`
- Create: `.agents/harness/workflows/apply-harness-update.md`
- Create: `.agents/harness/reports/proposals/.gitkeep`

- [ ] **Step 1: `HARNESS_MAINTENANCE.md`**

```markdown
# Harness Maintenance (자기유지 개요·인덱스)

> 하네스가 스스로를 outdated 상태에서 지키는 흐름의 인덱스. self-maintaining ≠ self-directing(원칙 8) — 깃발만 꽂고, 해소는 사람이 한다.

## 자기유지 흐름

Development Progress → Task Summary(`pnpm harness:summarize-diff`) → Harness Impact Check(Agent Task 6 질문) → Drift Detection(`pnpm harness:drift`) → Drift Report(`evals/drift-reports/`) → Update Proposal(propose-harness-update) → Human Review(review-harness-update) → Update Task(apply-harness-update) → Changelog(`CHANGELOG.md`). 작업 전 컨텍스트 수집은 `pnpm harness:context`.

## 인덱스

- 권한 경계 3단 + meta-eval: `UPDATE_POLICY.md`
- 7 drift 유형 점검표: `DRIFT_CHECKLIST.md`
- PO 대기 결정 로그: `DECISION_NEEDED.md`
- 변경 이력: `CHANGELOG.md`
- 설정 예시: `config/harness.config.example.json`
- 워크플로: `workflows/check-harness-drift.md` · `workflows/propose-harness-update.md` · `workflows/review-harness-update.md` · `workflows/apply-harness-update.md`

읽는 workflow: check-harness-drift.
업데이트 시점: 자기유지 구조 변경 (Level 2).
```

- [ ] **Step 2: `UPDATE_POLICY.md` (spec §4.4 전문 그대로)**

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

코드 ↔ _의도 문서_(PRD/Story) drift = 항상 "코드 의심" 기본값(세탁 경로 없음).
코드 ↔ _서술 문서_(README) drift만 자동 노트 안전.

## meta-eval — 하네스 자기변경 게이트 (D11)

mechanics diff(.agents/** · evals/** · .claude/rules/\*\* · docs/migration/02~05):

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

- [ ] **Step 3: `DRIFT_CHECKLIST.md` (seed §4.3.1 완성본 — 7 유형 표)**

```markdown
# Drift Checklist (7 유형)

> check-harness-drift의 Process가 읽는 점검표. 7 유형 × {시점 · Tier · 결정론 체크}. (05 §7)

| #   | drift 유형       | 시점            | Tier | 결정론/모델 체크                             |
| --- | ---------------- | --------------- | ---- | -------------------------------------------- |
| 1   | Architecture     | Record / sweep  | 2    | feature가 `expo-*` 직접 import 여부 grep     |
| 2   | Rule             | sweep           | 2    | `.claude/rules` ↔ 코드 괴리 → [HUMAN REVIEW] |
| 3   | Task Granularity | Record          | 1    | pass@3 반복 실패 누적 카운트                 |
| 4   | Verification     | Record          | 1    | 보존 eval red 뒤집힘 · 게이트 우회           |
| 5   | Product          | sweep           | 2    | 코드 ↔ PRD 의도 괴리 → [HUMAN REVIEW]        |
| 6   | Dependency       | Record          | 1    | expo/pkg 표준 이탈                           |
| 7   | Traceability     | Define / Record | 1    | 인용 경로/AC resolve (hallucinated-path)     |

결정론 floor(Tier 1) 우선: `validate:docs` · 인용 resolve · 보존 eval · AnalyticsEvent parity.
Tier 2 모델 보조는 주기 sweep에서만 [HUMAN REVIEW] 플래그.

읽는 workflow: check-harness-drift.
업데이트 시점: drift 기준 변경 (Level 2).
```

- [ ] **Step 4: `DECISION_NEEDED.md` (seed §4.3.1 완성본 — 초기 항목)**

```markdown
# Decision Needed (PO 대기 결정 — append-only)

> 하네스가 자율 결정할 수 없는 Level 3 항목을 깃발만 꽂는 로그(`UPDATE_POLICY.md`). 해소는 PO. propose-harness-update가 등록한다. 각 항목: {id · 차단 task · 해소 조건 · 상태}.

## 항목

- **G1-θ**: false-flag 임계 θ 미확정.
  - 차단: P2 부정탐지 Agent Task.
  - 해소 조건: G1 PoC 완료 + θ 주입(`docs/migration/01-rn-mvp-prd.md` §7 Q1).
  - 상태: open.
- **G2-legal**: 법무 검토 미완.
  - 차단: P1/P2 정산 기능 배포.
  - 해소 조건: 법무 통과 → boolean 게이트 flip(`docs/migration/01-rn-mvp-prd.md` §7 Q2).
  - 상태: open.
- **04-§9-UX**: invite re-tap UX 수용 vs Branch / Bottom Tabs 새 IA 승인.
  - 차단: 신규 IA Agent Task.
  - 해소 조건: PO 결정 + screenshot acceptance(`docs/migration/04-rn-architecture.md` §9).
  - 상태: open.

읽는 workflow: propose-harness-update.
업데이트 시점: 미결정 추가/해소 시.
```

- [ ] **Step 5: `CHANGELOG.md` (초기 엔트리)**

```markdown
# Harness Changelog (append-only)

> 하네스 머시너리 변경 이력. 모든 harness workflow가 변경 시 1줄 추가한다.

## 0.1 — 2026-06-04

- 하네스 MVP 파일 구조 scaffold (spec `2026-06-04-harness-mvp-file-structure-design` · ADR-0031).
- `.agents/{pm,engineering,migration,backlog,qa,workflows,harness}` + `docs/eng-stories` + `evals/{drift-reports,meta}` 생성.
- `harness:{check,drift,summarize-diff,context,verify}` 스크립트 wire-up (skeleton — 실제 구현은 후속 코드 단계, spec §8).
```

- [ ] **Step 6: `config/harness.config.example.json` (spec §4.7 전문 그대로)**

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
    "specs": "docs/superpowers/specs",
  },
  "tracks": {
    "port": { "preserveEval": true, "passK": "100%" },
    "greenfield": { "preserveEval": false, "passAt": 3 },
  },
  "gates": {
    "ledger_invariant": { "kind": "deterministic", "active": true },
    "idempotency": { "kind": "deterministic", "active": true },
    "false_flag_rate": {
      "kind": "threshold",
      "theta": null,
      "active": false,
      "blockedBy": "G1-PoC",
    },
    "legal_signoff": { "kind": "boolean", "value": false, "blockedBy": "G2-legal" },
  },
  "drift": {
    "anchors": ["define", "record", "sweep"],
    "tier1Deterministic": [
      "validate-docs",
      "citation-resolve",
      "preserve-eval",
      "analytics-parity",
    ],
    "tier2Model": { "enabled": true, "onlyDuring": "sweep" },
  },
  "sotPrecedence": ["PRD", "EngineeringStory", "JobStory"],
  "metaEval": {
    "mechanicsPaths": [".agents/**", "evals/**", ".claude/rules/**", "docs/migration/0[2-5]*"],
    "weakenReasonCodes": [
      "THRESHOLD_LOWERED",
      "TOLERANCE_WIDENED",
      "EVAL_REMOVED",
      "EVAL_DISABLED",
      "SEVERITY_DOWNGRADED",
      "SOT_PRECEDENCE_RELAXED",
      "AUTONOMY_EXPANDED",
      "APPROVAL_GATE_NARROWED",
    ],
    "recurrenceAlertThreshold": 3,
  },
}
```

> 주: 이 파일은 `.example.json` 이다. `harness:check`/`harness:drift`가 읽는 실제 `harness.config.json`은 스크립트 구현 단계(spec §8)에서 이 예시를 복사해 `theta`·`legal_signoff.value`를 주입한다.

- [ ] **Step 7: `workflows/check-harness-drift.md` (spec §4.5 전문 그대로)**

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

1. Architecture Drift — 레이어/경계 위반(feature가 expo-\* 직접 import 등)
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

- [ ] **Step 8: `workflows/propose-harness-update.md` (spec §4.5 전문 그대로)**

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

- [ ] **Step 9: `workflows/review-harness-update.md`**

```markdown
# Workflow: review-harness-update

## Goal

update proposal을 사람이 검토해 머지/반려. meta-eval weaken은 ADR + PO 승인 강제.

## Read First

- 대상 proposal(.agents/harness/reports/proposals/) · .agents/harness/UPDATE_POLICY.md

## Inputs

- proposal 1개

## Process

1. Level 분류 확인(1/2/3).
2. meta-eval 결과 확인: weaken이면 reason-code + ADR + PO 승인 없으면 Block.
3. Level 3 항목이 섞였으면 반려 → DECISION_NEEDED.md.

## Output Format

검토 결과: merge | block(사유) | escalate(PO).

## Stop Condition

- weaken 0건이거나 전부 PO 승인됨 → merge 허용.
```

- [ ] **Step 10: `workflows/apply-harness-update.md`**

```markdown
# Workflow: apply-harness-update

## Goal

승인된 proposal을 적용. Level 1은 자동 PR, Level 2는 사람 머지 후 CHANGELOG 기록.

## Read First

- 승인된 proposal · .agents/harness/UPDATE_POLICY.md · .agents/harness/CHANGELOG.md

## Inputs

- 승인된 proposal 1개

## Process

1. Level 1(경로명·script명·CHANGELOG·완료 task 상태·traceability 링크 보정) → 자동 PR.
2. Level 2 → 사람 머지 확인 후 적용.
3. CHANGELOG.md에 변경 1줄 추가(append-only).

## Output Format

적용 diff + CHANGELOG 엔트리.

## Stop Condition

- 변경 적용 + CHANGELOG 기록 + (weaken 시) reason-code 로그(evals/meta/).
```

- [ ] **Step 11: `reports/proposals/.gitkeep` 생성**

```bash
mkdir -p .agents/harness/reports/proposals && touch .agents/harness/reports/proposals/.gitkeep
```

- [ ] **Step 12: 확인 + Commit**

Run: `ls .agents/harness/ .agents/harness/workflows/ .agents/harness/config/`
Expected: 정책 5종 + workflows 4종 + config 1종 + reports/proposals/.gitkeep

```bash
git add .agents/harness/
git commit -m "feat(harness): 자기유지 머시너리 — UPDATE_POLICY·DRIFT·DECISION·config·harness workflows"
```

---

## Task 8: harness 스크립트 skeleton + package.json + evals 디렉토리

`harness-*.mjs`의 **실제 구현은 spec §8 Out of scope**. 본 task는 정직한 skeleton stub만 만든다 — 거짓 green을 막기 위해 stderr에 `SKELETON` 배너를 출력하고 `exit 0`. **미사용 import를 넣지 않는다**(scripts/는 eslint 대상이라 unused import는 lint 실패). 계약은 주석으로 남기고 import는 실제 구현 단계에서 추가한다.

**Files:**

- Create: `scripts/harness-check.mjs`
- Create: `scripts/harness-drift.mjs`
- Create: `scripts/harness-summarize-diff.mjs`
- Create: `scripts/harness-context.mjs`
- Modify: `package.json` (`"new"` 라인 뒤에 harness:\* 5종 추가)
- Create: `evals/drift-reports/.gitkeep`
- Create: `evals/meta/.gitkeep`

- [ ] **Step 1: `scripts/harness-check.mjs`**

```js
#!/usr/bin/env node
// scripts/harness-check.mjs  →  pnpm harness:check
// 결정론 Tier 1 하네스 검증 (drift 아님 — 구조·추적성 lint).
// 계약(구현 예정 — spec 2026-06-04-harness-mvp-file-structure-design §8):
//   1. .agents/harness/config/harness.config.json 로드
//   2. evals/tasks/*.md frontmatter 파싱 → Track·Parent 존재 검사
//   3. Parent 인용(PRD AC / Story 파일) 경로 resolve (hallucinated-path = Traceability drift)
//   4. 위반 모으기 → stderr 출력 + process.exit(위반 ? 1 : 0)
// 현재: SKELETON — 아직 검사 없음. 거짓 green 방지를 위해 명시 배너 출력 후 0 종료.
console.error(
  "[harness:check] SKELETON — 추적성·구조 lint 미구현 (spec §8 후속 코드 단계). 검사 0건, exit 0.",
);
process.exit(0);
```

- [ ] **Step 2: `scripts/harness-drift.mjs`**

```js
#!/usr/bin/env node
// scripts/harness-drift.mjs  →  pnpm harness:drift
// 7 drift 유형 점검 → evals/drift-reports/<date>.md (읽기전용 리포트).
// 계약: .agents/harness/DRIFT_CHECKLIST.md 의 7 유형 × Tier. 구현 예정(spec §8).
// 현재: SKELETON — 거짓 green 방지를 위해 배너 출력 후 0 종료.
console.error(
  "[harness:drift] SKELETON — 7 drift 점검 미구현 (spec §8 후속 코드 단계). 리포트 0건, exit 0.",
);
process.exit(0);
```

- [ ] **Step 3: `scripts/harness-summarize-diff.mjs`**

```js
#!/usr/bin/env node
// scripts/harness-summarize-diff.mjs  →  pnpm harness:summarize-diff
// git diff → Task Summary (Development Progress → Task Summary 단계).
// 출력 = 변경 파일·요약 → Harness Impact Check(Agent Task 6 질문) 입력. 구현 예정(spec §8).
// 현재: SKELETON — 배너 출력 후 0 종료.
console.error(
  "[harness:summarize-diff] SKELETON — diff 요약 미구현 (spec §8 후속 코드 단계). exit 0.",
);
process.exit(0);
```

- [ ] **Step 4: `scripts/harness-context.mjs`**

```js
#!/usr/bin/env node
// scripts/harness-context.mjs  →  pnpm harness:context <task-id>
// Agent Task 의 Source Files + 규칙 포인터를 모아 컨텍스트 번들 생성(=collect-context 대체).
// create-agent-tasks / implement-agent-task 의 Read First 입력. 구현 예정(spec §8).
// 현재: SKELETON — 배너 출력 후 0 종료.
console.error(
  "[harness:context] SKELETON — 컨텍스트 번들 미구현 (spec §8 후속 코드 단계). exit 0.",
);
process.exit(0);
```

- [ ] **Step 5: `package.json`에 harness 스크립트 추가**

`package.json`의 `"new": "node scripts/new-doc.mjs",` 라인 뒤에 아래 5줄을 삽입한다.

old_string:

```json
    "new": "node scripts/new-doc.mjs",
    "icons:pwa": "node scripts/generate-pwa-icons.mjs",
```

new_string:

```json
    "new": "node scripts/new-doc.mjs",
    "harness:check": "node scripts/harness-check.mjs",
    "harness:drift": "node scripts/harness-drift.mjs",
    "harness:summarize-diff": "node scripts/harness-summarize-diff.mjs",
    "harness:context": "node scripts/harness-context.mjs",
    "harness:verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm harness:check",
    "icons:pwa": "node scripts/generate-pwa-icons.mjs",
```

- [ ] **Step 6: evals 디렉토리 고정**

```bash
mkdir -p evals/drift-reports evals/meta && touch evals/drift-reports/.gitkeep evals/meta/.gitkeep
```

- [ ] **Step 7: 스크립트가 lint·typecheck 통과하는지 검증**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS (미사용 import 없음, 타입 에러 없음).

- [ ] **Step 8: 각 skeleton이 배너 출력 + exit 0 인지 검증**

Run: `pnpm harness:check; echo "exit=$?"`
Expected: stderr에 `[harness:check] SKELETON ...` + `exit=0`.

Run: `pnpm harness:drift; echo "exit=$?"`
Expected: `[harness:drift] SKELETON ...` + `exit=0`.

Run: `pnpm harness:summarize-diff; echo "exit=$?"`
Expected: `[harness:summarize-diff] SKELETON ...` + `exit=0`.

Run: `pnpm harness:context; echo "exit=$?"`
Expected: `[harness:context] SKELETON ...` + `exit=0`.

- [ ] **Step 9: Commit**

```bash
git add scripts/harness-check.mjs scripts/harness-drift.mjs scripts/harness-summarize-diff.mjs scripts/harness-context.mjs package.json evals/drift-reports/.gitkeep evals/meta/.gitkeep
git commit -m "feat(harness): harness:* 스크립트 skeleton + package.json wire-up + evals 디렉토리"
```

---

## Task 9: new-doc.mjs PM 타입 5종

`pnpm new`에 PM 아티팩트 타입을 추가한다(ADR-0031 §3, 후속 #3). template source 디렉토리를 타입별로 분기할 수 있게 일반화한다(기존 plan/spec/adr는 동작 불변).

**Files:**

- Modify: `scripts/new-doc.mjs` (TYPES + templateDir 일반화 · usage · Unknown type · templatePath)

- [ ] **Step 1: TYPES 객체 확장 + templateDir 상수 추가**

old_string:

```js
const TYPES = {
  plan: { dir: "docs/superpowers/plans", template: "plan.md" },
  spec: { dir: "docs/superpowers/specs", template: "spec.md" },
  adr: { dir: "docs/adr", template: "adr.md" },
};
```

new_string:

```js
const DEFAULT_TEMPLATE_DIR = "docs/superpowers/templates";
const PM_TEMPLATE_DIR = ".agents/pm/templates";

const TYPES = {
  plan: { dir: "docs/superpowers/plans", template: "plan.md" },
  spec: { dir: "docs/superpowers/specs", template: "spec.md" },
  adr: { dir: "docs/adr", template: "adr.md" },
  // PM family — template source는 .agents/pm/templates/ (ADR-0031 §3)
  prd: { dir: ".agents/pm", template: "PRD_TEMPLATE.md", templateDir: PM_TEMPLATE_DIR },
  "job-story": {
    dir: "docs/stories",
    template: "JOB_STORY_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "eng-story": {
    dir: "docs/eng-stories",
    template: "ENGINEERING_STORY_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "test-scenario": {
    dir: "docs/stories",
    template: "TEST_SCENARIO_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "acceptance-criteria": {
    dir: ".agents/pm",
    template: "ACCEPTANCE_CRITERIA_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
};
```

- [ ] **Step 2: usage 메시지 갱신**

old_string:

```js
function usage() {
  console.error("Usage: pnpm new <plan|spec|adr> <topic-kebab>");
  console.error("  예: pnpm new spec auth-magiclink-fix");
  process.exit(1);
}
```

new_string:

```js
function usage() {
  console.error(
    "Usage: pnpm new <plan|spec|adr|prd|job-story|eng-story|test-scenario|acceptance-criteria> <topic-kebab>",
  );
  console.error("  예: pnpm new spec auth-magiclink-fix");
  console.error("  예: pnpm new eng-story point-ledger");
  process.exit(1);
}
```

- [ ] **Step 3: Unknown type 메시지 갱신**

old_string:

```js
console.error(`Unknown type: ${typeArg}. Allowed: plan | spec | adr`);
```

new_string:

```js
console.error(
  `Unknown type: ${typeArg}. Allowed: plan | spec | adr | prd | job-story | eng-story | test-scenario | acceptance-criteria`,
);
```

- [ ] **Step 4: templatePath가 타입별 templateDir 사용**

old_string:

```js
const templatePath = resolve(REPO_ROOT, "docs/superpowers/templates", cfg.template);
```

new_string:

```js
const templatePath = resolve(REPO_ROOT, cfg.templateDir ?? DEFAULT_TEMPLATE_DIR, cfg.template);
```

- [ ] **Step 5: 기존 동작 불변 확인 (회귀 방지)**

Run: `pnpm lint scripts/new-doc.mjs`
Expected: PASS.

Run: `node scripts/new-doc.mjs 2>&1 | head -1`
Expected: 갱신된 usage 문자열(`plan|spec|adr|prd|...`) 출력.

- [ ] **Step 6: PM 타입 smoke — eng-story 생성 → 확인 → 정리**

Run: `pnpm new eng-story harness-smoke-test`
Expected: `Created: docs/eng-stories/2026-06-04-harness-smoke-test.md` (날짜는 당일).

Run: `head -8 docs/eng-stories/2026-06-04-harness-smoke-test.md`
Expected: frontmatter에 `eng-story: 2026-06-04-harness-smoke-test` · `title: Harness Smoke Test` 치환 확인.

정리(검증용 산출물 제거 — 커밋하지 않음):

```bash
rm docs/eng-stories/2026-06-04-harness-smoke-test.md
```

- [ ] **Step 7: prd 타입 smoke (`.agents/pm` 출력 경로 확인) → 정리**

Run: `pnpm new prd harness-smoke-test && ls .agents/pm/2026-06-04-harness-smoke-test.md`
Expected: `.agents/pm/2026-06-04-harness-smoke-test.md` 생성.

```bash
rm .agents/pm/2026-06-04-harness-smoke-test.md
```

- [ ] **Step 8: Commit**

```bash
git add scripts/new-doc.mjs
git commit -m "feat(harness): pnpm new에 PM 타입 5종 추가 (prd·job-story·eng-story·test-scenario·acceptance-criteria)"
```

---

## Task 10: evals/README.md — Kind 규칙 + frontmatter 확장 안내

`evals/README.md`는 **validate:docs 스캔 대상**. 추가하는 링크(`../.agents/backlog/AGENT_TASK_TEMPLATE.md`·`drift-reports/`)는 Task 4·8에서 이미 생성됐으므로 resolve된다. 기존 0001~0003 grandfather 규칙은 보존한다(ADR-0031 §5).

**Files:**

- Modify: `evals/README.md` (`## See also` 섹션 앞에 신규 섹션 삽입)

- [ ] **Step 1: 신규 섹션 삽입**

`evals/README.md`의 `## See also / Cross-module dependencies` 라인 바로 앞에 아래를 삽입한다.

old_string:

```markdown
## See also / Cross-module dependencies

- 결정 이력: [`../docs/adr/`](../docs/adr/) (회귀 catch 시 ADR 한 건 추가)
```

new_string:

```markdown
## RN 하네스 task (0004+) frontmatter 확장

ADR-0031 / spec `2026-06-04-harness-mvp-file-structure-design`에 따라 **0004번부터** frontmatter를 확장한다. 0001~0003은 grandfather(소급 변경 없음 — 비교 가능성 보존).

스키마 SoT: [`../.agents/backlog/AGENT_TASK_TEMPLATE.md`](../.agents/backlog/AGENT_TASK_TEMPLATE.md).

- `Track`: port | greenfield (D2 — 보존 eval 적용 여부)
- `Kind`: migration | regression (migration=닫히는 work-unit / regression=영속 baseline)
- `Parent`: spine 인용(PRD AC → ... → Agent Task)
- `Status`: todo | blocked | in_progress | done
- `Blocked-by`: blocked일 때 해제 조건(예: G1-PoC θ 확정)

drift 리포트는 [`drift-reports/`](drift-reports/)에 append-only 누적된다.

## See also / Cross-module dependencies

- 결정 이력: [`../docs/adr/`](../docs/adr/) (회귀 catch 시 ADR 한 건 추가)
```

- [ ] **Step 2: validate:docs 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references` (FAIL 0건).

- [ ] **Step 3: Commit**

```bash
git add evals/README.md
git commit -m "docs(evals): RN 하네스 task frontmatter 확장(Track·Kind·Parent) + Kind 규칙 안내"
```

---

## Task 11: docs/eng-stories/README.md — Engineering Story 집

**validate:docs 스캔 대상.** ENGINEERING_STORY_TEMPLATE(Task 1)·migration 문서·ADR-0031은 모두 존재하므로 링크가 resolve된다.

**Files:**

- Create: `docs/eng-stories/README.md`

- [ ] **Step 1: 작성**

```markdown
# docs/eng-stories/

Engineering Story의 집(05 D10). "[결과]를 위해 시스템은 [기술 변경]을 해야 한다, [제약] 때문에" — 시스템 언어 작업-서사. 1 Engineering Story → N Work Package.

## 왜 별도 디렉토리

`docs/stories/`(Job Story = 사용자 의도)와 대칭. "Job ≠ Engineering ≠ Agent Task"(05 §1)를 물리적으로 보존한다. Work Package는 파일이 없으므로(D5) Engineering Story가 spine에서 Work Package 바로 위의 유일한 서사 노드 — 자기 집이 필요하다.

## 템플릿 / 생성

- 템플릿 SoT: [`../../.agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md`](../../.agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md)
- 생성: `pnpm new eng-story <topic-kebab>`

## grandfather

[`../migration/00-rn-conversion-plan.md`](../migration/00-rn-conversion-plan.md) · [`../migration/04-rn-architecture.md`](../migration/04-rn-architecture.md)는 "프로젝트 전체 Engineering Story"로 grandfather(이미 쓰인 foundational 서사). 앞으로의 _기능별_ Engineering Story만 여기 추가한다.

## 추적성

PRD AC 상향 인용 + spec/ADR 직교 인용 + Work Package spawn. 인용은 `harness:check`가 resolve 검증한다(hallucinated-path = Traceability drift).

## See also

- 두 축 개념 모델: [`../migration/05-rn-harness-decisions.md`](../migration/05-rn-harness-decisions.md) §1
- 구조 결정: [`../adr/0031-harness-structure-agents-home.md`](../adr/0031-harness-structure-agents-home.md)
```

- [ ] **Step 2: validate:docs 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

- [ ] **Step 3: Commit**

```bash
git add docs/eng-stories/README.md
git commit -m "docs(eng-stories): Engineering Story 집 README + 템플릿 포인터 (05 D10)"
```

---

## Task 12: .agents/README.md — tool-agnostic 진입점

**validate:docs 스캔 대상.** 가리키는 workflows·pm·harness 파일이 Task 1~7에서 모두 생성됐으므로 mdlink·backtick 경로가 resolve된다. `pnpm harness:*`는 `/`·확장자가 없어 backtick 검사 대상이 아니다.

**Files:**

- Create: `.agents/README.md`

- [ ] **Step 1: 작성**

```markdown
# .agents/ — AI 하네스 머시너리 (tool-agnostic 진입점)

> 머시너리 = 하네스를 _돌리는_ 것(템플릿·워크플로·정책). 인스턴스 = 하네스가 _만든_ 것(`docs/`·`evals/`). Codex·Claude·Cursor 공통 진입점. (ADR-0031)

## 한 줄

PWA→RN 전환 하네스. 제품(pm) → 분해 spine → Agent Task(`evals/tasks`) → 검증(`pnpm harness:*`) → 자기유지(harness).

## 작업 종류 → workflow 매핑

| 작업              | workflow                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| PRD 생성/정규화   | [workflows/create-prd.md](workflows/create-prd.md)                                 |
| Test Scenario     | [workflows/create-test-scenarios.md](workflows/create-test-scenarios.md)           |
| Job Story         | [workflows/create-job-stories.md](workflows/create-job-stories.md)                 |
| Engineering Story | [workflows/create-engineering-stories.md](workflows/create-engineering-stories.md) |
| Work Package 분해 | [workflows/split-work-packages.md](workflows/split-work-packages.md)               |
| Agent Task 분해   | [workflows/create-agent-tasks.md](workflows/create-agent-tasks.md)                 |
| Agent Task 구현   | [workflows/implement-agent-task.md](workflows/implement-agent-task.md)             |
| 리뷰              | [workflows/review-agent-task.md](workflows/review-agent-task.md)                   |
| 검증 수정         | [workflows/fix-verification.md](workflows/fix-verification.md)                     |

## 디렉토리

- `pm/` — 제품 맥락·템플릿·PM adapter: [pm/PM_PLUGIN_ADAPTER.md](pm/PM_PLUGIN_ADAPTER.md) · [pm/PRODUCT_CONTEXT.md](pm/PRODUCT_CONTEXT.md)
- 규칙 포인터(본문 복제 금지): [engineering/INDEX.md](engineering/INDEX.md) · [migration/INDEX.md](migration/INDEX.md)
- `backlog/` — Work Package·Agent Task 템플릿·Traceability
- `qa/` — dogfood QA·release 체크리스트
- `workflows/` — 도구 중립 절차 SoT(9)
- 자기유지(정책·drift·changelog·config): [harness/HARNESS_MAINTENANCE.md](harness/HARNESS_MAINTENANCE.md)

## 검증 (도구 무관 CLI)

- `pnpm harness:context <task-id>` — 구현 전 컨텍스트 번들
- `pnpm harness:summarize-diff` — 구현 후 Task Summary
- `pnpm harness:check` — 결정론 Tier 1 추적성·구조 lint
- `pnpm harness:drift` — 7 drift 점검 → drift report
- `pnpm harness:verify` — typecheck · lint · test · check

> 현재 `harness:*`는 skeleton(spec §8) — 실제 검증 로직은 후속 코드 단계에서 채운다.

## 인스턴스 홈

- PRD: `docs/PRD.md` · `docs/migration/01-rn-mvp-prd.md`
- Job Story: `docs/stories/` · Engineering Story: `docs/eng-stories/`
- Agent Task: `evals/tasks/` · 결과: `evals/results/`
- 결정: `docs/adr/` · `docs/superpowers/specs/`
```

- [ ] **Step 2: validate:docs 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

만약 backtick 경로(`engineering/INDEX.md` 등)가 broken으로 잡히면 해당 파일이 Task 3에서 생성됐는지 확인한다. validate:docs의 backtick resolver는 repo-root 우선·file-relative fallback이므로 `.agents/engineering/INDEX.md`로 fallback resolve된다.

- [ ] **Step 3: Commit**

```bash
git add .agents/README.md
git commit -m "feat(harness): .agents/README.md — tool-agnostic 진입점(작업종류→workflow 매핑)"
```

---

## Task 13: AGENTS.md — 하네스 라우팅 섹션

**validate:docs 스캔 대상.** `.agents/README.md`(Task 12)·ADR-0031·05가 존재하므로 링크가 resolve된다. surgical하게 §1과 §2 사이에 1개 섹션만 삽입한다.

**Files:**

- Modify: `AGENTS.md` (§1 끝 ~ §2 시작 사이에 "하네스 라우팅" 섹션 삽입)

- [ ] **Step 1: 섹션 삽입**

`AGENTS.md`에서 §1의 마지막 bullet과 `## 2. 작업 시작 프로토콜` 사이에 삽입한다.

old_string:

```markdown
- **구조 원칙**: Next.js 공식 route colocation(`app/(app)/<route>/_components` · `_actions.ts`) + 얇은 공용 `src/lib/*` + shadcn primitive `src/components/ui/*`. `src/features/` 신설 금지

## 2. 작업 시작 프로토콜
```

new_string:

```markdown
- **구조 원칙**: Next.js 공식 route colocation(`app/(app)/<route>/_components` · `_actions.ts`) + 얇은 공용 `src/lib/*` + shadcn primitive `src/components/ui/*`. `src/features/` 신설 금지

## 1.5 하네스 라우팅 (PWA→RN 전환)

PWA→RN 전환 작업은 AI 하네스를 따른다. 머시너리(템플릿·워크플로·정책)는 tool-agnostic [`.agents/`](.agents/README.md)에, 인스턴스(PRD·Story·Agent Task)는 `docs/`·`evals/`에 있다(ADR-0031).

- 진입점: [`.agents/README.md`](.agents/README.md) — 작업 종류 → workflow 매핑
- 검증: `pnpm harness:check` · `pnpm harness:drift` · `pnpm harness:verify`
- Codex도 동일: `AGENTS.md → .agents/README.md → workflows/*.md` 평문 markdown 직접 실행
- 세부 결정: [ADR-0031](docs/adr/0031-harness-structure-agents-home.md) · [05-rn-harness-decisions](docs/migration/05-rn-harness-decisions.md)

## 2. 작업 시작 프로토콜
```

- [ ] **Step 2: validate:docs 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): AGENTS.md에 하네스 라우팅 섹션 추가 (.agents 진입점·Codex 동일)"
```

---

## Task 14: migration 02/03/04 → 05 back-ref + 최종 전체 검증

ADR-0031 후속 #6 / 05 §9.2 consistency debt — 02·03·04가 05를 역참조하도록 Pre-read에 1줄씩 추가. 이 문서들은 validate:docs 스캔 대상이 아니지만 링크는 정확히 쓴다. 마지막으로 전체 검증 스위트를 돌린다.

**Files:**

- Modify: `docs/migration/02-rn-migration-harness.md` (Pre-read 끝)
- Modify: `docs/migration/03-rn-migration-rules.md` (Pre-read 끝)
- Modify: `docs/migration/04-rn-architecture.md` (Pre-read 끝)

- [ ] **Step 1: 02 back-ref**

old_string:

```markdown
> - [eval-harness 스킬](../../.claude/skills/eval-harness/SKILL.md) — EDD(평가 주도 개발) 프레임워크
```

new_string:

```markdown
> - [eval-harness 스킬](../../.claude/skills/eval-harness/SKILL.md) — EDD(평가 주도 개발) 프레임워크
> - [05-rn-harness-decisions](./05-rn-harness-decisions.md) — 02~04를 가로지르는 하네스 결정(D1~D12)
```

- [ ] **Step 2: 03 back-ref**

old_string:

```markdown
> - [AGENTS.md §3 가드레일](../../AGENTS.md) — RLS·secret·keyword freeze·analytics parity 등 절대 원칙
```

new_string:

```markdown
> - [AGENTS.md §3 가드레일](../../AGENTS.md) — RLS·secret·keyword freeze·analytics parity 등 절대 원칙
> - [05-rn-harness-decisions](./05-rn-harness-decisions.md) — 02~04를 가로지르는 하네스 결정(D1~D12)
```

- [ ] **Step 3: 04 back-ref**

old_string:

```markdown
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 반복 빌드·검증 루프 + 보존 eval 게이트
```

new_string:

```markdown
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 반복 빌드·검증 루프 + 보존 eval 게이트
> - [05-rn-harness-decisions](./05-rn-harness-decisions.md) — 02~04를 가로지르는 하네스 결정(D1~D12)
```

- [ ] **Step 4: 최종 전체 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (스크립트·package.json 정상).

Run: `pnpm harness:verify; echo "exit=$?"`
Expected: typecheck → lint → test 통과 후 `[harness:check] SKELETON ...` 배너 + `exit=0`.

Run: `git status`
Expected: clean (모든 변경 커밋됨).

- [ ] **Step 5: Commit**

```bash
git add docs/migration/02-rn-migration-harness.md docs/migration/03-rn-migration-rules.md docs/migration/04-rn-architecture.md
git commit -m "docs(migration): 02·03·04 → 05 back-ref 추가 (ADR-0031 후속 #6 consistency debt)"
```

---

## 후속 (이 계획 범위 밖 — spec §8 명시)

- **`scripts/harness-{check,drift,summarize-diff,context}.mjs` 실제 구현** — frontmatter 파싱·인용 resolve·diff 요약·컨텍스트 번들의 결정론 로직. 별도 구현 plan + (harness-check은 평가 가능하므로) TDD 권장.
- **`harness:report` 풀 렌더** + Tier 2 모델 grader.
- **TRACEABILITY 수동 시드(P0 9개)** + 첫 마일스톤 sweep (spec §7.7 — 운영 단계).
- **D9·D12 ADR 승급 · D11 meta-eval spec 승급** (05 §9.3).
- **RN 워크스페이스 scaffold 후 `expo-doctor` 와이어링**.

## Self-Review 체크 (계획 작성자 기준 — 실행 전 1회 확인)

- **spec 커버리지**: §4.2 디렉토리 전 항목 → Task 1~7·12. §4.4 ★템플릿 3종 → Task 1·2·4. §4.5 ★워크플로 4종 → Task 6·7. §4.6 스크립트+package.json → Task 8. §4.7 config → Task 7. §4.3.1 seed 6종 → Task 2·3·7·12. `scripts/new-doc.mjs` PM 타입 → Task 9. `evals/README.md` Kind → Task 10. `docs/eng-stories/README.md` → Task 11. `AGENTS.md` 라우팅 → Task 13. 02/03/04 back-ref → Task 14.
- **placeholder 없음**: 모든 파일 내용이 전문으로 들어감(★=spec 인용, seed=완성본). `<...>`는 템플릿 사용자 입력 슬롯이지 계획의 미완성이 아님.
- **타입 일관성**: harness:\* 스크립트명 ↔ package.json 키 ↔ README 표기 일치. PM 타입명(`eng-story` 등) ↔ new-doc TYPES 키 ↔ 출력 디렉토리 일치.
- **validate:docs 순서 안전**: 스캔 대상 README/AGENTS(Task 10~13)는 참조 파일 생성(Task 1~8) 이후에만 작성됨.
