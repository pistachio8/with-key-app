# Workflow: route-request (자연어 요청 → 분류 → 기존 워크플로 인계)

## Goal

사용자의 자연어 요청을 받아 **작업 타입을 분류**하고, **이미 있는 하네스 워크플로**로 인계한 뒤 첫 사람 게이트에서 멈춘다. 이 문서는 "오케스트레이터(관리자 메인 에이전트)"가 따르는 절차의 SoT(Single Source of Truth, 단일 원본)다.

이 레포에는 백로그를 전진시키는 오케스트레이터([orchestrate-backlog.md](orchestrate-backlog.md))와 task 생명주기(`todo→in_progress→done` + blocker token)가 이미 있다. 이 워크플로는 그 **앞단의 intake 문**이다 — "작업이 아직 task 로 존재하지 않는 raw 요청"을 분류해 올바른 생성/구현 워크플로로 보낸다. 새 상태머신·새 생명주기를 만들지 않는다.

## SoT 관계 (drift 방지)

세 파일이 역할을 나눠 가진다. 본문을 서로 복제하지 않는다([ADR-0031](../../docs/adr/0031-harness-structure-agents-home.md) 본문 복제 금지).

- **이 문서(`route-request.md`)** — 오케스트레이터 절차·정책 산문 (사람/에이전트가 읽음)
- **`route-manifest.json`** — 타입 → 워크플로/게이트/스코프 매핑 데이터 (스크립트가 소비)
- **`scripts/harness-route-lib.mjs`** — 분류 키워드·알고리즘 (deterministic 실행). 아래 "대표 키워드" 는 이 파일 표의 발췌일 뿐, 전체 목록은 lib 이 원본이다.

## Read First

- `pnpm harness:route "<요청>"` 출력 (분류 1차 제안)
- [orchestrate-backlog.md](orchestrate-backlog.md) · [full-pipeline.md](full-pipeline.md) (인계 후 흐름)
- `docs/migration/05-rn-harness-decisions.md` D6 (push/PR/merge/spec/adr/po = 사람 게이트)

## 오케스트레이터 동작 규약 (매 턴)

관리자는 직접 코드를 많이 고치지 않는다. "이 요청이 어떤 종류인지 판단하고 어느 워크플로로 보낼지" 를 결정한다.

1. 사용자 자연어 요청을 받는다.
2. `pnpm harness:route "<요청>"` 로 1차 분류를 본다 (deterministic — LLM 비호출).
3. **분류 확인**: `ambiguous: true` 이거나 confidence 가 낮으면(임계값 0.6 미만) **자동 진행 금지** → 사용자에게 "이 작업은 X 타입으로 보이는데 맞나요?" 확인. 키워드 분류는 brittle 하므로 이 확인이 안전밸브다.
4. 확정된 타입의 `targetWorkflow`(manifest)로 인계한다. 필요하면 `pnpm harness:intake "<요청>"` 로 run 기록을 남긴다.
5. **첫 사람 게이트에서 정지·보고**한다 (D6: push·PR·merge·spec·adr·po). 무인이라도 outward 행위는 사람 몫.

## 타입별 분류·인계

각 타입은 **새 워크플로를 발명하지 않고** 아래 실재 파일로 인계한다.

### bugfix

- **언제**: 기존에 동작하던 것이 깨졌다/잘못됐다/되면 안 되는데 된다.
- **대표 키워드**: 버그 · 에러 · 깨짐 · 안 됨 · 잘못 · 수정해 · 고쳐
- **읽을 것**: `AGENTS.md` · `docs/BE_SCHEMA.md` · 도메인 후보 파일(실시간 탐색)
- **인계**: 재현 테스트 고정 → [create-agent-tasks.md](create-agent-tasks.md) → [implement-agent-task.md](implement-agent-task.md) (검증 실패 시 [fix-verification.md](fix-verification.md))
- **바로 구현 금지 / 사람 게이트**:
  ```txt
  버그라고 말해도 기존 명세/주석/정책과 충돌하면 바로 구현하지 않고 SPEC_CHECK 로 보낸다.
  재현 테스트 또는 실패 조건을 먼저 고정한다.
  ```

### feature

- **언제**: 새 기능·새 화면·새 지원을 추가한다.
- **대표 키워드**: 추가해 · 새로 만들 · 기능 넣 · 지원하게
- **읽을 것**: `docs/PRD.md`(AC) · `docs/BE_SCHEMA.md` · 관련 도메인
- **인계**: [create-engineering-stories.md](create-engineering-stories.md) → [split-work-packages.md](split-work-packages.md) → [create-agent-tasks.md](create-agent-tasks.md) → [implement-agent-task.md](implement-agent-task.md)
- **사람 게이트**: 측정 가능한 AC 인지 PO 확인 · 새 `spec`/`adr` 필요 시 정지.

### improvement

- **언제**: 동작은 하지만 더 낫게(UX·성능·리팩토링).
- **대표 키워드**: 개선 · 성능 · 리팩토 · 불편 · 최적화
- **인계**: (경량) [create-agent-tasks.md](create-agent-tasks.md) → [implement-agent-task.md](implement-agent-task.md)
- **바로 구현 금지**: 현재 동작/플로우를 먼저 분석(CURRENT_FLOW_ANALYSIS)하고 개선 가설을 명시.

### prd

- **언제**: 제품 요구·정책·범위·시나리오를 정의/변경한다.
- **대표 키워드**: PRD · 기획서 · 요구사항 · 정책 · MVP
- **인계**: [create-prd.md](create-prd.md) (full-pipeline Stage 1–3)
- **바로 구현 금지 / 사람 게이트**: 코드부터 만지지 않는다 — 문서·**PO 승인** 경로. AC 측정 가능성 확인 후에만 분해로 내려간다.

### harness-improvement

- **언제**: 하네스 자체(라우팅 룰·검증 플로우·상태머신·`.agents/`)를 바꾼다. "에이전트가 계속 같은 실수를 한다" 류.
- **대표 키워드**: 하네스 · meta-eval · `.agents` · 상태머신 · workflow · 라우팅 룰
- **인계**: [.agents/harness/UPDATE_POLICY.md](../harness/UPDATE_POLICY.md) · [DECISION_NEEDED.md](../harness/DECISION_NEEDED.md) · `evals/meta/`
- **절대 원칙**:
  ```txt
  하네스 기준 변경은 자동 반영하지 않는다.
  반드시 improvement proposal → meta-eval → human approval 을 거친다.
  테스트 기준 완화, reviewer 제거, human gate 제거, SoT 우선순위 변경은 자동 승인 금지다.
  ```

### docs

- **언제**: 문서화·README·주석·가이드 작성.
- **인계**: 경량 직접 처리 (별도 워크플로 없음). 코드 동작 변경이 섞이면 bugfix/feature 로 재분류.

### analysis

- **언제**: 원인 파악·조사·"왜 그런지". **코드 변경 없음**(읽기 전용).
- **인계**: 읽기 전용 조사 → 결과 보고. 변경이 필요하면 적절한 타입으로 재분류 후 재라우팅.

## 우선순위 규칙 (중복 매칭 시)

- `하네스`·`meta-eval`·`.agents`·`상태머신`·`workflow`·`라우팅 룰` 포함 → **harness-improvement 우선** (기준 변경은 meta-eval 게이트라, "버그"처럼 보여도 bugfix 로 처리하면 안 된다).
- `PRD`·`기획서`·`정책`·`요구사항`·`MVP` 포함 → **prd 우선** (코드보다 문서·승인 경로).

## 인계 지점 (intake → 백로그)

분류 후 task 가 없으면 `create-agent-tasks` 로 Agent Task 를 만든다. 백로그에 들어가면 그 다음부터는 **기존 흐름**이 인계받는다:

```bash
pnpm harness:next                 # 착수 가능 task 확인
pnpm harness:claim <EVAL-ID>      # todo→in_progress
pnpm harness:goal <EVAL-ID>       # /goal 프롬프트 렌더 → 구현 루프
```

이후는 [orchestrate-backlog.md](orchestrate-backlog.md) 의 1 tick 모델과 동일하다.

## 명령

```bash
pnpm harness:route "<요청>"       # 분류 JSON (파일 변경 없음)
pnpm harness:intake "<요청>"      # 분류 + evals/runs/ run 기록 + 다음 사람 액션 안내
```

Claude 세션은 `.claude/commands/orchestrate.md` 래퍼로도 호출한다(도구 어댑터 — 본문 SoT 는 이 문서).

## Stop Condition

- intake 는 분류·라우팅·run 기록까지만 한다. 실제 구현·claim·finalize·push 는 하지 않는다.
- 매 턴은 정확히 한 사람 게이트(분류 확인 또는 D6)에서 멈춘다.

## 용어집

- **ambiguous**: 분류 신뢰도가 임계값(0.6) 미만이거나 여러 타입이 비등하게 매칭된 상태. 자동 진행 금지 신호.
- **D6**: `docs/migration/05-rn-harness-decisions.md` 결정 6 — push·PR·merge·spec·adr·po 는 사람 게이트(절대 경계).
- **intake**: 아직 task 로 존재하지 않는 raw 자연어 요청을 분류·접수하는 단계.
- **SoT**: Single Source of Truth — 중복 없이 기준으로 삼는 단일 원본.
- **머시너리/인스턴스**: 하네스를 _돌리는_ 것(`.agents/`) / 하네스가 _만든_ 것(`docs/`·`evals/`). run 기록은 인스턴스이므로 `evals/runs/` (ADR-0031).
