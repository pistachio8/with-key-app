# ADR-0031: AI 하네스 구조 — `.agents/` 단일 머시너리 홈 + 인스턴스(docs/evals) 분리

**Date**: 2026-06-04
**Status**: accepted
**Deciders**: pistachio8 (PO)

> **연관 문서**: [05-rn-harness-decisions](../migration/05-rn-harness-decisions.md) (D1~D12 — 하네스 *결정*) · [AGENTS.md](../../AGENTS.md) (에이전트 운영 규칙) · [04-rn-architecture](../migration/04-rn-architecture.md) (RN 타깃 아키텍처)
>
> **용어 한 줄**: **머시너리(machinery)** = 하네스를 *돌리는* 것(템플릿·워크플로·정책·어댑터). **인스턴스(instance)** = 하네스가 *만든* 것(실제 PRD·Story·Agent Task·결정). 이 ADR은 *어떻게 만드나*는 `.agents/`에, *무엇을 만들었나*는 `docs/`·`evals/`에 둔다는 결정이다.

## Context

[05](../migration/05-rn-harness-decisions.md)가 하네스의 *결정*(D1~D12, 두 축 개념 모델)을 닫았으나, 그 머시너리가 **물리적으로 어디에 사는지**는 미정으로 남았다. Prompt 2 아키텍처 설계가 `.agents/{pm,engineering,migration,...}` 제네릭 트리를 제안했지만, 그 템플릿은 **빈 repo를 전제**한다. fromwith는 그렇지 않다.

현 상태의 제약:

- **이 repo엔 이미 성숙한 하네스가 있다**: `AGENTS.md` · `docs/QUALITY_GATE.md` · `.claude/rules/{common,typescript,web}/*`(23개) · `docs/adr/`(30개) · `docs/superpowers/{templates,specs,plans}/` · `evals/{tasks,results}` · `docs/migration/00~05`. 제네릭 트리를 그대로 만들면 `docs/ARCHITECTURE.md`·`.claude/rules/`를 **복제**하게 되어, [05 §7](../migration/05-rn-harness-decisions.md) drift 감지가 막으려는 바로 그 SoT(Single Source of Truth, 단일 진실 원천) 이중화를 자초한다. 이는 [05 D1](../migration/05-rn-harness-decisions.md)(전용 우선·최소)과 surgical 원칙 위반이다.
- **repo는 이미 두 홈을 구분해 운영 중이다**: `.agents/`는 **tool-agnostic**(Codex CLI가 자동 로드, `.agents/skills/`를 이미 사용) · `.claude/`는 **Claude 전용**. 따라서 "어디에 두나"는 단순 정리가 아니라 **어떤 도구가 그 머시너리를 보느냐**를 가른다.
- `docs/superpowers/templates/{plan,spec,adr}.md` + `scripts/new-doc.mjs`(`pnpm new`)가 이미 검증된 scaffold 경로다.

그래서 세 가지를 못박아야 한다 — ① 머시너리 홈 ② 인스턴스 홈 ③ 기존 자산과의 관계.

## Decision

**AI 하네스 *머시너리*는 tool-agnostic `.agents/` 단일 진입점에 두고, *인스턴스*는 기존 [05 D10](../migration/05-rn-harness-decisions.md) 홈(`docs/`·`evals/`)에 두며, 엔지니어링·마이그레이션 규칙은 복제하지 않고 포인터(INDEX)로 가리킨다.**

세부 규칙:

1. **머시너리/인스턴스 분리** (D-R1). 머시너리 = `.agents/{pm,engineering,migration,workflows,harness}`. 인스턴스 = `docs/`(PRD·Story·결정) + `evals/`(Agent Task·결과). **왜**: "어떻게 만드나"와 "무엇을 만들었나"가 한 디렉토리에 섞이면 drift 표면이 폭발한다([05 §2 대가의 정직한 기록](../migration/05-rn-harness-decisions.md)).
2. **engineering·migration = 포인터** (D-R2). `.agents/engineering/INDEX.md`·`.agents/migration/INDEX.md`는 본문을 쓰지 않고 기존 SoT를 가리킨다 — `.claude/rules/*`(코딩·테스트·보안) · `docs/migration/03`(전환 규칙) · `04`(RN 아키텍처) · `docs/ARCHITECTURE.md` · `docs/BE_SCHEMA*.md`. **본문 복제 금지**. **왜**: 복제 즉시 두 SoT가 갈라져 drift 1순위 표면이 된다.
3. **템플릿 = 두 family, 단일 scaffold**. 제품 아티팩트(PRD·Job Story·Engineering Story·Test Scenario·Acceptance Criteria) → `.agents/pm/templates/`. 프로세스·결정(plan·spec·adr) → 기존 `docs/superpowers/templates/`. 둘은 *중복이 아니라 다른 family*다. `pnpm new`에 PM 타입을 추가해 진입점은 하나로 유지한다.
4. **워크플로 = tool-agnostic SoT + 기존 불가침** (Q2). `.agents/workflows/*`(create-prd … fix-verification)가 절차 SoT(Codex+Claude 공용). 기존 `.claude/commands/` 9개는 **그대로 둔다**(surgical) — 겹치는 워크플로(`implement-agent-task`↔`implement-plan`, `review-agent-task`↔`review`, `fix-verification`↔`check`)는 본문에 상호참조 1줄만, Claude 전용 래퍼는 필요할 때만 lazy 추가.
5. **Agent Task = 기존 dir + frontmatter 확장** (Q3). `evals/tasks/NNNN-*.md`(0004부터) 유지, frontmatter에 `Track`(port|greenfield) · `Parent`(spine 인용) · `Non-goals` · `Verify` · `Kind`(regression|migration) 추가. 기존 0001~0003은 grandfather. "task spec 수정 금지"는 *각 task의 비교 가능성*에 적용되는 규칙이라 신규 필드 추가와 충돌하지 않는다(비교성은 task별·시점별).
6. **Test Scenario = eval에 접힘, 매트릭스는 생성물** (D-R3, [05 D10](../migration/05-rn-harness-decisions.md)). 별도 SoT를 두지 않고 Agent Task eval 수용기준으로 흡수. traceability 매트릭스(`TS-* → PRD AC → Story → eval task → 상태`)는 `harness:report` **생성 출력**이며 체크인하지 않는다(체크인 = 또 하나의 drift 표면).
7. **self-maintaining = `.agents/harness/` + `evals/` 확장** ([05 D6·D7·D11](../migration/05-rn-harness-decisions.md)). 정책·체크리스트·changelog·워크플로 → `.agents/harness/`. drift report → `evals/drift-reports/`, meta-eval 분류기·weaken reason-code 로그 → `evals/meta/`.
8. **스크립트 = pnpm** (D-R4). `harness:check`·`harness:drift`·`harness:report`를 `scripts/harness-*.mjs`로. Expo 게이트(`expo-doctor`)는 RN 워크스페이스 scaffold 후 활성, PM·Backlog·Drift 하네스는 지금 활성.

**이 ADR이 정하지 않는 것(범위 밖)**: [05 §9.3](../migration/05-rn-harness-decisions.md)의 승급 — D9(두 축 개념 모델)·D12(게이트 파라미터화) ADR 승급, D11(meta-eval) spec 승급은 별도 후속이다.

## Alternatives Considered

### 1. 전부 기존 홈에 접기 (`.agents/` 신규 0)

- **Pros**: 가장 surgical. 신규는 `docs/eng-stories/`만.
- **Cons**: self-maintaining(D6/D7/D11)이 tool-agnostic 홈 없이 `AGENTS.md`·`docs/`·`.claude/`로 흩어진다. 워크플로가 `.claude/commands/`(Claude 전용)에 묶인다.
- **Why not**: 미래 범용 추출([05 D1](../migration/05-rn-harness-decisions.md) rule-of-three) 시 "하네스가 어디부터 어디까지인가"를 다시 찾아야 한다. 단일 진입점의 이식성을 잃는다.

### 2. `.claude/` 전용에 전부

- **Pros**: Claude Code 세션엔 가장 자연스럽다.
- **Cons / Why not**: Codex·Cursor가 머시너리를 못 본다 → [05 D8](../migration/05-rn-harness-decisions.md) tool-agnostic 원칙(하네스는 특정 도구에 하드 의존하지 않는다) 정면 위반.

### 3. engineering·migration 본문을 `.agents/`에 복제 (Prompt 2 원안)

- **Pros**: 하네스 트리가 자기완결적으로 보인다.
- **Cons / Why not**: `docs/ARCHITECTURE.md`·`.claude/rules/`와 즉시 두 SoT. drift 1순위 표면 + [05 D1](../migration/05-rn-harness-decisions.md)·surgical 위반. 포인터(규칙 2)가 같은 자기완결성을 복제 없이 준다.

## Consequences

### 긍정적

- **단일 진입점**: 하네스 머시너리 전체가 `.agents/` 한 곳. 신규 협업자·에이전트가 "하네스가 무엇인가"를 한 디렉토리에서 본다.
- **tool-agnostic**: Codex·Cursor도 `.agents/`를 읽어 동일 워크플로·정책을 따른다.
- **무복제**: 검증된 기존 자산(`.claude/rules/`·`docs/migration/03·04`·`evals/`·`docs/superpowers/templates/`)을 복제하지 않아 drift 표면을 최소화.
- **기계 검증 가능**: Agent Task의 Track·Parent가 frontmatter라 `harness:check`가 인용 resolve·트랙 태그를 파싱할 수 있다([05 §7 Tier 1 결정론](../migration/05-rn-harness-decisions.md)).
- **이식성**: 미래 rule-of-three 추출 시 `.agents/`를 통째로 떼어내고 프로젝트 고유값만 교체.

### 부정적 / 비용

- **템플릿 물리 분리**: PM family(`.agents/pm/templates/`)와 프로세스 family(`docs/superpowers/templates/`)가 두 곳 → "어디서 찾지" 혼동 가능. 완화 = `pnpm new` 단일 진입점 + 각 INDEX의 명시 포인터.
- **워크플로 이중 존재**: SoT(`.agents/workflows/`)와 Claude 커맨드(`.claude/commands/`)가 갈라질 수 있는 divergence 리스크. 완화 = 상호참조 1줄 + D7 sweep 대상에 포함.
- **`.agents/`가 또 하나의 drift 표면**: 포인터(INDEX)가 가리키는 기존 파일이 이동·삭제되면 끊긴다 → 정확히 [05 §7](../migration/05-rn-harness-decisions.md) Traceability drift(Tier 1 결정론)로 잡아야 할 대상.

### 후속 영향

본 결정이 강제하는 후속 작업:

1. `docs/eng-stories/README.md` + Engineering Story 템플릿 생성([05 §9.2](../migration/05-rn-harness-decisions.md) consistency debt).
2. `.agents/{pm/templates, pm/adapters, pm/raw, engineering/INDEX, migration/INDEX, workflows, harness}` scaffold.
3. `scripts/new-doc.mjs`에 PM 타입(prd·job-story·eng-story·test-scenario·acceptance-criteria) 추가.
4. `evals/tasks/` 템플릿 frontmatter 확장 + `evals/README.md`에 `Kind`(regression|migration) 규칙 1줄.
5. `scripts/harness-check.mjs`·`harness-drift.mjs`(결정론 Tier 1) + `package.json` 스크립트 + `evals/drift-reports/`·`evals/meta/` 디렉토리.
6. `docs/migration/02·03·04`가 `05`를 역참조하도록 back-reference 추가, 본 ADR을 `05`·후속 `06`에서 인용.
7. **(별도 후속)** [05 §9.3](../migration/05-rn-harness-decisions.md) — D9·D12 ADR 승급, D11 meta-eval spec 승급.

## 용어집

- **머시너리 / 인스턴스**: 하네스를 *돌리는* 것(템플릿·워크플로·정책) / 하네스가 *만든* 것(실제 PRD·Story·Task). 본 ADR의 분리 축.
- **tool-agnostic**: 특정 AI 도구(Claude·Codex·Cursor)에 묶이지 않음. `.agents/`는 tool-agnostic, `.claude/`는 Claude 전용.
- **포인터(INDEX)**: 본문을 복제하지 않고 기존 SoT 파일을 가리키기만 하는 얇은 문서.
- **grandfather**: 기존 산출물을 새 규칙 소급 적용 대상에서 면제하는 것(기존 `evals/tasks/0001~0003`).
- **SoT(Single Source of Truth)**: 중복 정의 없이 기준으로 삼는 단일 원본.
- **drift 표면**: 서로 어긋날 수 있는(따라서 감지·정합이 필요한) 아티팩트 쌍이 늘어나는 지점.
- **port / greenfield 트랙**: 포팅(보존 baseline 있음) / 신기능(baseline 없음). Agent Task `Track` 필드 값([05 D2](../migration/05-rn-harness-decisions.md)).
