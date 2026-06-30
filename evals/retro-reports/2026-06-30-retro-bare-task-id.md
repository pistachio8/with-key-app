# 하네스 회고 — 2026-06-30 (bare task-ID off-mapping 집중)

> 이 보고서는 **특정 off-mapping 패턴 하나** — 사용자가 기존 백로그 task 를 bare task-ID 로만 지칭하며 착수를 요청할 때 (`EVAL-NNNN + 착수/진행하자/이어서/구현`) 라우터가 `no-keyword-match → analysis 0.2 ambiguous` 로 폴백하는 현상 — 에 집중한다.
> 직전 회고: `evals/retro-reports/2026-06-26-retro.md` (baseline)

---

## 1. 표본

| 소스                                      | 건수 | 기간                    |
| ----------------------------------------- | ---- | ----------------------- |
| `evals/runs/*.json` (intake 라우팅)       | 21   | 2026-06-19 ~ 2026-06-30 |
| `evals/results/agent-results.json` runs[] | 41   | 2026-06-08 ~ 2026-06-30 |

이전 기준선(17건) 대비 `evals/runs/` +4 건, `evals/results/` +10 건.

---

## 2. 라우팅 회고 — bare task-ID off-mapping

### 2-1. 빈도·실증

**evals/runs/\*.json 직접 집계** (분모 21건)

| 지표                                                      | 분자/분모 | 비율                          |
| --------------------------------------------------------- | --------- | ----------------------------- |
| 전체 off-vocab (analysis, confidence 0.2, ambiguous true) | 6 / 21    | 28.6%                         |
| 그중 요청에 `EVAL-\d+` 포함(bare task-ID 패턴)            | 2 / 6     | 33.3% (전체 대비 2/21 = 9.5%) |
| 그 외 off-vocab (WP 분해, ADR 초안, 분석 질문 등)         | 4 / 6     | 66.7%                         |

**bare task-ID 케이스 run 파일 근거 2건**

| runId                              | 원문 요청                                                  | classification | confidence | ambiguous |
| ---------------------------------- | ---------------------------------------------------------- | -------------- | ---------- | --------- |
| `2026-06-24T05-14-32-227-analysis` | `EVAL-0043 영상 캡처·저장 + 스토리 자동재생(Phase 1) 구현` | analysis       | 0.2        | true      |
| `2026-06-30T02-53-15-080-analysis` | `EVAL-0052 작업 진행하자`                                  | analysis       | 0.2        | true      |

**evals/results/agent-results.json notes 교차 확인** — run 파일 없는 케이스 3건

| taskId    | notes 원문 발췌 (라우팅 관련)                                                                                                               | 파일            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| EVAL-0046 | `route ambiguous(0.2, 기존 백로그 task 참조라 키워드 미스 정상)`                                                                            | run 파일 없음   |
| EVAL-0052 | `라우팅 off-mapping 관찰: 'EVAL-NNNN 작업 진행하자' no-keyword-match(후속 gated)`                                                           | run 파일도 있음 |
| EVAL-0057 | `'EVAL-0057 착수' 가 기존 백로그 task ID 참조라 키워드 미스인 정상 케이스(분류 모호성 아님) → 기존 READY task 라 implement-agent-task 직행` | run 파일 없음   |

**확인 불가 케이스**: EVAL-0041 — 힌트에 포함됐으나 run 파일에서 bare task-ID 패턴 없음. 해당 시점의 intake run 파일 미보존이거나 harness:intake 비경유. 추정 금지 — "로그에서 확인 불가"로 처리.

**종합**: run 파일 직접 확인 2건 + notes 간접 확인 2건 = 최소 **4건** bare task-ID off-mapping(41 tasks 기준 9.8%, 21 run 파일 기준 2/21). 사용자가 "EVAL-NNNN 착수하자", "EVAL-NNNN 작업 진행하자", "EVAL-NNNN 구현" 패턴으로 요청할 때마다 clarify 게이트가 강제 발동하는 구조적 패턴.

### 2-2. 메커니즘 확인 (scripts/harness-route-lib.mjs 소스 교차검증)

**키워드 공백 (line 24-70, `CLASSIFIER_KEYWORDS`)**

아래 동사가 어떤 타입 표에도 없음:

- `착수`, `착수하자`, `진행`, `진행하자`, `이어서`, `작업`
- `구현` 단독 (주: `"구현해줘"` 는 feature 에 있으나 "해줘" 생략형 미매칭)

`EVAL-\d+` 형식의 task-ID 패턴을 감지하는 규칙이 `CLASSIFIER_KEYWORDS` / `PRIORITY_RULES`(line 76-94) 어느 쪽에도 없음.

**no-keyword-match 폴백 로직 (line 144-153)**

```javascript
// scripts/harness-route-lib.mjs
if (matchedTypes.length === 0 && !forced) {
  return {
    classification: "analysis",
    confidence: 0.2,
    matchedKeywords: [],
    scores: {},
    ambiguous: true,
    reason: "no-keyword-match",
  };
}
```

"EVAL-0052 작업 진행하자" → `matchedTypes.length === 0`, `forced === null` → analysis 0.2 ambiguous. `buildRoute()`(line 311-314)가 ambiguous 시 `humanGateTokens`에 `"clarify"` 강제 추가 → 오케스트레이터가 사용자에게 타입 확인 요청 발동.

**라우트 구조 공백 (route-manifest.json)**

7개 `routes` 타입 중 "기존 task 구현(implement existing)" 전용 타입 없음. `bugfix` / `feature` / `improvement` 모두 `taskCreation: ".agents/workflows/create-agent-tasks.md"` 포함 — 이미 존재하는 task를 착수하는 경우에도 task 생성 워크플로를 경유하도록 설계. 기존 task 직행 경로 부재.

**실제 의도 타입 비교**

사용자 의도는 `orchestrate-backlog.md` 흐름의 `harness:claim <EVAL-ID>` + `harness:goal <EVAL-ID>` — 이미 백로그에 있는 task의 구현 착수. `route-request.md`의 설계 목적("아직 task 로 존재하지 않는 raw 요청을 분류")과 불일치. task 파일(`evals/tasks/NNNN-*.md`)을 읽으면 `Kind`/`Status`/`Blocked-by` 로 타입·착수 가능성이 즉시 결정됨(EVAL-0052: Kind=migration, EVAL-0057: Kind=migration, EVAL-0046: Kind=migration).

---

## 3. 결과 회고 (신규 배치 2026-06-26 이후)

| 지표                                    | 분자/분모          | 비율 |
| --------------------------------------- | ------------------ | ---- |
| abandon                                 | 0 / 10 (신규 runs) | 0%   |
| done                                    | 10 / 10            | 100% |
| pass@1                                  | 10 / 10            | 100% |
| drift 재발 (모노레포 test filter quirk) | 이번 배치 미발생   | —    |

2026-06-26 retro §3-4에서 경보 임박(×3 경보 구간 2회)으로 지목된 "모노레포 test filter quirk"가 이번 배치에서 재발하지 않음. ×3 경보 미도달(누계 2회, 1회 추가 필요).

---

## 4. 개선 후보 (랭킹)

> `[L2]` = UPDATE_POLICY Level 2 (제안+meta-eval+사람). `[L3]` = Level 3 PO 전용.
> meta-eval weaken reason-code: APPROVAL_GATE_NARROWED · THRESHOLD_LOWERED · TOLERANCE_WIDENED · EVAL_REMOVED · EVAL_DISABLED · SEVERITY_DOWNGRADED · SOT_PRECEDENCE_RELAXED · AUTONOMY_EXPANDED

### 4-1. 후보 안 B — route 출력에 bare task-ID 힌트 추가 (gate 미변경) [권장 선행]

**변경 내용**: `buildRoute()`에 post-processing 추가. 요청에 `EVAL-\d+`가 포함되고 `reason === "no-keyword-match"`인 경우, 반환 객체에 아래 두 필드 추가:

- `detectedPattern: "bare-task-id"`
- `suggestedNextStep: "task 파일(evals/tasks/NNNN-*.md) 확인 → Kind/Status 기반 implement-agent-task 직행"`

추가로 `route-request.md` 절차 산문에 "요청에 bare task-ID(`EVAL-\d+`)가 포함된 경우 task 파일을 먼저 읽어 Kind/Status를 확인하고 clarify 게이트 전에 self-resolve를 시도한다" 조항 추가.

**기대 효과**: clarify 게이트는 여전히 발동하지만, 오케스트레이터가 task 파일을 확인해 스스로 타입을 결정할 수 있는 signal 제공 → 사용자에게 묻는 마찰 제거. 구현이 단순(run 파일 + route-request 절차 2개 파일만 수정).

**false-positive 위험**: 없음. 분류 로직 자체를 변경하지 않아 기존 gate 보존. 힌트를 오케스트레이터가 무시해도 기존 동작 유지.

**거버넌스 분류**:

- meta-eval: 기존 gate 미제거 → **neutral/strengthen** → weaken reason-code 해당 없음.
- Level: **L2** — route 출력 구조 변경은 "capability/feature 경계" 변경에 해당.
- `scripts/harness-route-lib.mjs` 는 `scripts/` 경로 — `harness-improvement` 라우트의 `allowedWriteScopes`(`.agents/harness/**`)에 포함되지 않음. propose-harness-update 시 `scripts/**` 스코프를 별도 명시 필요.
- 권장 라우트: `propose-harness-update` → meta-eval neutral 확인 → 사람 승인 → `apply-harness-update`.
- ADR 불필요 (weaken 없음).

### 4-2. 후보 안 A — route-lib에 bare task-ID 전용 신호 + 신규 라우트 추가 [gate 변경, 후속 단계]

**변경 내용**: 두 파일 수정.

1. `scripts/harness-route-lib.mjs`: `classifyRequest()`에 `EVAL-\d+` + 착수 동사([진행|착수|이어서|구현|작업|하자]) 공존 감지 로직 추가. 감지 시 `classification: "existing-task"`, `confidence: 0.85`, `reason: "existing-task-reference"`, `ambiguous: false` 반환.
2. `route-manifest.json`: `routes`에 `"existing-task"` 타입 추가. `targetWorkflow: ".agents/workflows/implement-agent-task.md"`, `taskCreation: null`(기존 task 직행), `humanGateTokens: ["gate"]`.

**기대 효과**: "EVAL-0052 작업 진행하자" → `existing-task`, 0.85, non-ambiguous → clarify 게이트 불필요 → task 파일 확인 후 `implement-agent-task` 직행. 마찰 완전 제거.

**false-positive 위험 및 완화책**:

| 오탐 시나리오                                       | 위험도 | 완화                                                                                                                                         |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "EVAL-0052 가 왜 blocked 야?" → implement 잘못 분류 | 낮음   | 동사 화이트리스트(착수/진행하자/이어서/구현/하자/작업)에 "야", "왜", "어떻게", "확인" 미포함. 질문 패턴은 분석 키워드("왜 그런")에 먼저 잡힘 |
| "EVAL-0052 확인해줘" → implement                    | 낮음   | "확인"은 키워드 테이블에 없고 동사 화이트리스트 미포함                                                                                       |
| "EVAL-0052 분석해줘" → implement                    | 낮음   | "분석"이 `analysis` CLASSIFIER_KEYWORDS에 있어 analysis가 먼저 매칭                                                                          |
| 착수 동사 화이트리스트가 좁아서 미탐                | 중간   | 초기 보수 화이트리스트로 시작 후 retro 에서 확장                                                                                             |

추가 완화: `?`, `왜`, `어떻게` 공존 시 `existing-task` 비발동 조건 추가 권장.

**거버넌스 분류**:

- meta-eval: `EVAL-NNNN + 동사` 요청의 clarify 게이트 제거 → **APPROVAL_GATE_NARROWED** → **weaken** → ADR 필요 + PO 승인.
- Level: **L2** — capability 경계 변경 + weaken → `propose-harness-update` + ADR + PO 승인 + auto-merge 차단.
- `scripts/harness-route-lib.mjs` + `route-manifest.json` 양쪽 `allowedWriteScopes` 밖(`scripts/**`, `.agents/workflows/**`) → propose-harness-update 시 두 스코프 명시 필요.
- `allowedWriteScopes` 참고: `harness-improvement` 라우트는 `.agents/harness/**` · `evals/meta/**` · `docs/adr/**`만 허용. `scripts/`와 `.agents/workflows/`는 별도 scope 추가 없이는 제안자가 명시적으로 scope를 요청해야 함.

### 개선 후보 비교표

| 측면                | 안 B (힌트 추가)                        | 안 A (전용 라우트)                              |
| ------------------- | --------------------------------------- | ----------------------------------------------- |
| 마찰 제거 정도      | 부분 (오케스트레이터 self-resolve 가능) | 완전 (clarify 불필요)                           |
| gate 변경           | 미변경                                  | clarify 게이트 제거                             |
| meta-eval weaken    | 없음 (neutral/strengthen)               | APPROVAL_GATE_NARROWED (weaken)                 |
| ADR 필요            | 아니오                                  | 예                                              |
| false-positive 위험 | 없음                                    | 존재 (동사 화이트리스트로 완화)                 |
| 수정 파일 수        | 2 (route-lib, route-request.md)         | 3 (route-lib, route-manifest, route-request.md) |
| 권장 순서           | **1순위 선행**                          | 안 B 효과 관찰 후 escalation                    |

**전체 랭킹 (이번 집중 retro 한정)**

| 순위 | 후보                                                           | 근거 지표                                                             | Level       | meta-eval              | 권장 라우트                                           |
| ---- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- | ---------------------- | ----------------------------------------------------- |
| 1    | 안 B — route 출력에 bare task-ID 힌트 추가                     | 2/21 run + 4건 notes / 반복 패턴                                      | L2          | neutral/strengthen     | propose-harness-update → 사람 승인                    |
| 2    | 안 A — existing-task 전용 라우트 신설                          | 동상 + clarify gate 완전 제거 효과                                    | L2 + weaken | APPROVAL_GATE_NARROWED | ADR 작성 → propose-harness-update → PO 승인           |
| 3    | `orchestrate-backlog.md` 에 "bare task-ID 직접 감지" 조항 추가 | route-request.md 와 orchestrate-backlog.md 간 진입점 혼동이 근본 원인 | L2          | neutral                | propose-harness-update (.agents/workflows/\*\* scope) |

> 후보 3 보충: "사용자가 EVAL-NNNN 으로 착수를 요청하면 route-request.md 가 아닌 orchestrate-backlog.md 진입"이라는 조항을 route-request.md 의 용어집/Stop Condition 에 명시하는 안. route-lib 코드 비수정, 절차 산문만 변경 → 가장 낮은 위험.

---

## 5. 측정 공백

| 지표                                         | 상태                                                                                           | 캡처 추가 시 건드려야 할 곳                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| run 파일에 `reason` 필드 미저장              | 2026-06-26 retro 후보 4 여전히 미적용. 이번 집계도 `confidence === 0.2 && ambiguous` 간접 집계 | `scripts/harness-intake.mjs` `buildRoute()` 결과 직렬화 시 `reason` · `scores` · `matchedKeywords` 포함 (후보 4) |
| EVAL-0046 · EVAL-0057 intake run 파일 미보존 | harness:intake 비경유 또는 분류 전 정정 → 로그 누락. EVAL-0041 bare task-ID 여부 확인 불가     | run 파일 생성 시점에 대한 오케스트레이터 가이드 강화 — "bare task-ID 요청도 harness:intake 먼저" 명시            |
| misroute 정정율                              | 측정 불가 (캡처 부재). 2026-06-26 retro §5 동일                                                | `harness-intake.mjs` 또는 claim 시점에 `actual_classification` 필드 추가                                         |

---

## 6. keep / revert (2026-06-26 retro 제안 효과)

| 2026-06-26 retro 제안                                      | 이번 배치 지표 영향                                                                               | 판정                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `"구현"` → feature 키워드 추가 (후보 1)                    | 미적용. "EVAL-0043 ... 구현" 패턴이 2026-06-30 현재도 동일하게 analysis 폴백.                     | **keep** (미적용 — 제안 유효)                     |
| `"분해해"` → feature 키워드 추가 (후보 2)                  | 미적용. 이번 배치에 "분해" 패턴 재발 없음(run 없음).                                              | **keep** (미적용)                                 |
| `"adr"` → docs 키워드 추가 (후보 3)                        | 미적용. "ADR" 포함 run("헤드리스 substrate 전환 ... ADR-0042") 이번 배치에서도 analysis 0.2 폴백. | **keep** (미적용 — 제안 유효)                     |
| run JSON `reason`/`scores`/`matchedKeywords` 저장 (후보 4) | 미적용. 이번 회고도 간접 집계 의존.                                                               | **keep** (미적용)                                 |
| 모노레포 test filter quirk 가이드 (후보 5)                 | 미적용. 이번 배치 quirk 재발 없음 → ×3 누계 2회(경보 미도달).                                     | **keep** (미적용 — 경보 비도달이므로 긴박성 낮음) |

2026-06-26 제안 5건 전부 미적용. 이번 회고 개선 후보(안 B, 안 A, 후보 3)는 직전 retro 제안 중 `"구현"` 키워드 추가(후보 1)와 부분 겹침(bare task-ID에서 "구현" 단독이 중요 동사). 미적용 상태에서 두 번째 retro에서도 같은 패턴이 재확인됨 — 다음 retro 전 적용 여부 사람 결정 권장.

---

## 다음 사람 액션 (PO 결정 문항)

1. **안 B 선행 승인 여부**: `scripts/harness-route-lib.mjs`에 `detectedPattern: "bare-task-id"` 힌트 필드를 추가하고 `route-request.md` 절차 산문에 self-resolve 조항을 추가하는 것을 승인하는가? (L2, neutral, ADR 불필요)

2. **안 A 단계적 진행 여부**: 안 B 효과 관찰 후 `existing-task` 전용 라우트를 신설하고 clarify 게이트를 제거하는 안 A로 escalation할 것인가? (L2 + APPROVAL_GATE_NARROWED weaken → ADR 필요)

3. **allowedWriteScopes 확장 여부**: `harness-improvement` 라우트의 현행 `allowedWriteScopes`는 `.agents/harness/**` · `evals/meta/**` · `docs/adr/**`만 허용한다. `scripts/**`와 `.agents/workflows/**`를 추가로 허용할 것인가? (이 자체가 L2 + AUTONOMY_EXPANDED weaken → ADR 필요)

4. **2026-06-26 retro 제안 적용 우선순위**: 5건 미적용 제안 중 어느 것을 먼저 처리할 것인가? (run JSON `reason` 필드 저장 = 후보 4 가 이후 회고 정확도 향상에 직결)

---

> 이 proposal 은 PO 게이트 대기 — 적용은 사람 승인 후.
> 하네스 회고자는 진단·측정·후보 제시까지 수행한다. `.agents/**` · `scripts/**` · `route-manifest.json` 수정은 하지 않는다 (UPDATE_POLICY 원칙 8, 본 보고서 작업 범위).
