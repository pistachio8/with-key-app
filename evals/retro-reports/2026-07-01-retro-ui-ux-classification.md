# 하네스 회고 — 2026-07-01 (UI/UX 어휘 off-mapping 집중)

> 이 보고서는 **특정 off-mapping 패턴 하나** — 사용자가 UI 컴포넌트를 **명사**로 서술하며 변경을 요청할 때(예: "네비게이션을 상시 보여주고 뒤로가기 버튼이 있으면 좋겠어") 라우터가 `no-keyword-match → analysis 0.2 ambiguous` 로 폴백하는 현상 — 에 집중한다. 촉발 사건은 2026-07-01 실제 요청 1건.
> 직전 회고: `evals/retro-reports/2026-06-30-retro-bare-task-id.md` (bare task-ID 집중)

---

## 1. 표본

| 소스                                       | 건수 | 기간                    |
| ------------------------------------------ | ---- | ----------------------- |
| `evals/runs/*.json` (intake 라우팅)        | 24   | 2026-06-19 ~ 2026-07-01 |
| `evals/results/agent-results.json` runs[]  | 43   | 2026-06-08 ~ 2026-07-01 |

직전 기준선(2026-06-30 retro, 21건/41건) 대비 `evals/runs/` +3건, `evals/results/` +2건.

---

## 2. 라우팅 회고 — UI/UX 어휘 off-mapping

### 2-1. 빈도·실증

**evals/runs/\*.json 직접 집계** (분모 24건, `classification === "analysis" && confidence === 0.2 && ambiguous === true`)

| 지표                                                       | 분자/분모 | 비율 |
| ----------------------------------------------------------- | --------- | ---- |
| 전체 off-vocab (no-keyword-match 확정 — 아래 메커니즘 참조) | 8 / 24    | 33.3% |
| 그중 UI 컴포넌트 명사 서술형(이번 회고 집중 패턴)          | 1 / 8     | 12.5% (전체 대비 1/24 = 4.2%) |
| ambiguous(true) 전체                                        | 8 / 24    | 33.3% |

이번 배치에서 `ambiguous=true`는 예외 없이 8건 모두 위 off-vocab 케이스와 정확히 일치한다. `priority-forced-tie`·`low-confidence-or-tie`(타입 간 점수 동점) 케이스는 이번 24건 표본에서 0건 — 충돌 타입쌍 분석 대상 없음.

**UI/UX 명사 서술형 케이스 — run 파일 근거 (1건, 촉발 사건)**

| runId                              | 원문 요청                                                                     | classification | confidence | ambiguous |
| ----------------------------------- | ------------------------------------------------------------------------------ | --------------- | ---------- | --------- |
| `2026-07-01T08-06-29-064-analysis` | `RN 앱 상단 네비게이션을 페이지마다 상시 보여주고 뒤로가기 버튼이 있으면 좋겠어` | analysis        | 0.2        | true      |

**교차 확인**: `evals/results/agent-results.json`(43건 notes/summary 전문)과 `evals/runs/*.json`(24건 request 전문)을 `버튼`·`네비게이션`·`헤더`·`모달`·`레이아웃`·`no-keyword-match` 키워드로 grep한 결과, 이 1건 외 UI 컴포넌트 명사가 라우팅 실패로 이어진 사례는 없음 — **최초 관측**이다. 빈도 자체는 낮다(n=1). 다만 아래 2-2 메커니즘 확인 결과, 이 낮은 빈도는 "아직 발생 안 함"이지 "구조적으로 안전함"이 아니다 — 재발이 필연적인 공백이 확인된다.

### 2-2. 메커니즘 확인 (`scripts/harness-route-lib.mjs` 소스 교차검증)

**키워드 공백 — `CLASSIFIER_KEYWORDS`(line 24-70) 7개 타입 전수 스캔**

아래 UI 컴포넌트/레이아웃 명사가 7개 타입(`bugfix`·`feature`·`improvement`·`prd`·`harness-improvement`·`docs`·`analysis`) **어디에도** 없음(라인 단위 전수 확인, 부분 문자열 포함 검사):

`네비게이션` · `내비게이션` · `뒤로가기` · `버튼` · `헤더` · `탭바` · `화면` · `레이아웃` · `모달` · `다이얼로그` · `토스트` · `여백` · `정렬` · `아이콘` · `색상` · `폰트` · `스크롤`

**`improvement` 에 이미 있는 것과 없는 것을 정확히 구분**(line 42):

```javascript
// scripts/harness-route-lib.mjs line 42
improvement: ["개선", "더 쉽게", "ux", "성능", "리팩토", "리팩터", "불편", "최적화", "정리해"],
```

`"ux"` 키워드는 **이미 존재**한다. 그러나 이는 사용자가 영문 약어 `"UX"`/`"ux"`를 문자 그대로 쓸 때만 매칭된다. 촉발 요청 `"RN 앱 상단 네비게이션을 페이지마다 상시 보여주고 뒤로가기 버튼이 있으면 좋겠어"`에는 `ux` 부분 문자열이 없다(`norm()` 소문자 변환 후에도 미포함) — 사용자가 UI를 **한글 명사**(네비게이션, 버튼)로 서술하면 기존 `"ux"` 키워드는 구조적으로 도움이 안 된다.

`feature`(line 41)는 **동사** 위주다:

```javascript
feature: ["추가해", "새로 만들", "기능 넣", "지원하게", "만들어줘", "구현해줘", "새 기능"],
```

촉발 요청은 `"~있으면 좋겠어"`(암묵적 바람, wish) 형태로 끝나 `"추가해"`류 명시적 생성 동사가 없다 — feature 매칭도 실패.

**no-keyword-match 폴백 로직 (line 145-153, 이미 두 차례 회고에서 확인된 동일 분기)**

```javascript
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

이후 `buildRoute()`(line 311-314)가 `ambiguous: true`에 `"clarify"`를 `humanGateTokens`에 강제 추가 — 실제 run 파일의 `humanGateTokens: ["clarify"]`와 일치. `analysis` 라우트(`route-manifest.json` line 92-101)는 `targetWorkflow: null` · `taskCreation: null` · `allowedWriteScopes: []`이므로, clarify로 사람이 개입하지 않으면 이 요청은 자연스러운 다음 단계가 없다 — **안전망(clarify)은 이번에도 정상 작동했다.** 비용은 "물어볼 필요 없었던 질문을 물어보는 마찰"이지 silent misroute가 아니다.

**결론**: UI 컴포넌트를 명사로 서술하는 요청 클래스 전체가 현재 7개 타입 키워드 표에서 구조적으로 커버되지 않는다. n=1은 "우연히 아직 한 번만 발생"이지, 메커니즘상 앞으로도 같은 패턴("~버튼이 있으면", "~헤더를 고정해줘", "~레이아웃이 답답해")이 요청될 때마다 동일하게 재발한다.

### 2-3. 부수 관찰 — 나머지 off-vocab 7건 클러스터 (이번 회고 범위 밖, 참고용)

이번 회고는 UI/UX 패턴 1건에 집중하되, 나머지 7건의 원인도 정직하게 분류해 다음 회고 후보로 이월한다.

| 클러스터                              | 건수 | 예시 요청                                                          | 상태                                                              |
| -------------------------------------- | ---- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| bare task-ID (`EVAL-\d+` + 착수 동사) | 3    | `EVAL-0067(RN 공통 디자인 토큰 확장) 착수`                         | 2026-06-30 retro 안 B 적용됨(§6 참조) — 그러나 여전히 재발(3건, 직전 회고 2건 대비 증가) |
| ADR/spec 어휘 미스 (`docs` 키워드 공백) | 2    | `D-2 push token 모델 ADR 초안 작성`                                | 2026-06-26 retro 후보3("adr" → docs) 미적용 상태 지속               |
| "분해" 동사형 미스 (`feature` 어휘)   | 1    | `RN Phase 6 알림(...) WP/Agent Task 분해 — create-agent-tasks`    | 2026-06-26 retro 후보2("분해해")가 "해" 없는 이 변형은 커버 못 함(신규 관찰) |
| "측정" 동사 미스 (`analysis` 어휘)    | 1    | `Rollout 4 probe 선행 — ... 이득 실재성 먼저 측정 후 재평가`         | 신규 관찰, 미제안 상태                                             |
| **UI/UX 명사 서술형(본 회고 집중)**   | 1    | `RN 앱 상단 네비게이션을 ... 뒤로가기 버튼이 있으면 좋겠어`        | §4 개선 후보 참조                                                  |

bare task-ID 클러스터가 3/8(37.5%)로 여전히 최다 비중이며 §6에서 별도로 다룬다. ADR/spec 어휘 미스(2건)는 2026-06-26 retro에서 이미 제안됐으나 두 번째 회고에서도 미적용 확인 — keep 판정(§6).

---

## 3. 결과 회고 (신규 배치 2026-06-30 이후)

| 지표     | 분자/분모 | 비율 |
| -------- | --------- | ---- |
| abandon  | 0 / 3     | 0%   |
| done     | 3 / 3     | 100% |
| pass@1   | 3 / 3     | 100% |

대상: `EVAL-0052`(2026-06-30, migration/port) · `EVAL-0049`(2026-06-30, migration/greenfield) · `EVAL-0067`(2026-07-01, migration/greenfield). 3건 모두 `attempts:1`, `review.criticalHigh:0`, verdict `fixed`/`pass`. **주의**: `EVAL-0052`는 2026-06-30 retro 작성 시점과 완료 시각 선후가 로그(날짜 단위)만으로는 명확히 구분되지 않아 직전 회고와 중복 포함됐을 가능성이 있다 — 보수적으로 포함해 보고하며, 정확한 시각(timestamp) 캡처 부재는 §5에 기록한다. drift 재발 관찰 없음(이번 배치 3건 모두 drift-report 신규 언급 없음).

---

## 4. 개선 후보 (랭킹)

> `[L1]` = UPDATE_POLICY Level 1 (하네스 자율, harness:drift + apply-harness-update). `[L2]` = Level 2 (제안+meta-eval+사람). `[L3]` = Level 3 PO 전용.
> meta-eval weaken reason-code: APPROVAL_GATE_NARROWED · THRESHOLD_LOWERED · TOLERANCE_WIDENED · EVAL_REMOVED · EVAL_DISABLED · SEVERITY_DOWNGRADED · SOT_PRECEDENCE_RELAXED · AUTONOMY_EXPANDED

### 4-1. 후보 안 B — 신규 `ui-ux` 분류 타입 신설 [PO 채택안, 이번 회고 주력]

**변경 내용**: `CLASSIFIER_KEYWORDS`에 8번째 타입 `ui-ux` 추가 + `route-manifest.json`에 대응 route 신설. 상세 설계(키워드 목록·route 필드·경계 기준)는 동반 ADR 초안(`docs/adr/0045-ui-ux-classification-type.md`, Status: Proposed)에 전문 기술.

**기대 효과**: UI 컴포넌트 명사 서술형 요청이 `ui-ux`로 직접 분류되어 clarify 질문 없이 `CURRENT_UI_ANALYSIS` 단계로 바로 진입 — bare task-ID 안 A(2026-06-30 retro)와 동일한 급의 마찰 제거.

**false-positive 위험**: 있음. UI 명사(`버튼`·`화면`)는 버그 리포트에도 흔히 동시 등장할 수 있는 일반어라 `bugfix`와 스코어 동점 → ambiguous 유발 가능성(현재 24건 표본에서 실측 충돌 사례는 0건 — 정성적 우려이지 실증된 빈도 아님, ADR §Consequences에서 완화책 제시).

**거버넌스 분류**:

- meta-eval: **weaken = APPROVAL_GATE_NARROWED**. 현재는 UI 명사 단독 요청이 항상 `confidence 0.2 → ambiguous → clarify` 로 떨어져 100% 사람 확인을 거친다. `ui-ux` 신설로 단일 키워드만 매칭돼도 `ranked.length===1` 분기(line 187-188)를 타 `confidence = min(0.6+0.1*1, 0.95) = 0.7`, `ambiguous=false`가 되어 **clarify가 발동하지 않는 경로가 새로 생긴다** — 사람 승인 표면이 좁아지는 것이 정확히 APPROVAL_GATE_NARROWED의 정의와 일치한다(2026-06-30 retro 안 A와 동일 reason-code).
- Level: **L2** — capability(신규 분류 타입) 경계 변경 + weaken → **ADR 필수** + PO 승인 + auto-merge 차단.
- `scripts/harness-route-lib.mjs`(키워드 로직)와 `.agents/workflows/route-manifest.json`(route 엔트리)은 `harness-improvement` 라우트의 현행 `allowedWriteScopes`(`.agents/harness/**` · `evals/meta/**` · `docs/adr/**`) **밖**이다 — apply 시 `scripts/**` · `.agents/workflows/**` 스코프를 propose-harness-update에 명시적으로 추가해야 한다(2026-06-30 retro와 동일 지적, 아직 미해결).
- 권장 라우트: ADR(`0045`, 본 회고 동반 초안) → `propose-harness-update`(scope 명시) → meta-eval weaken 확인 → **PO 승인** → `apply-harness-update`. auto-merge 금지.

### 4-2. 후보 안 A — `improvement` 키워드에 UI 명사 추가 (신규 타입 없음, gate 미변경) [대안]

**변경 내용**: 신규 타입을 만들지 않고 `CLASSIFIER_KEYWORDS.improvement`에 UI 명사(`네비게이션`·`버튼`·`레이아웃` 등)를 직접 추가.

**기대 효과**: 촉발 요청이 `improvement`로 분류되어 `CURRENT_FLOW_ANALYSIS` 진입. 파일 1개(`scripts/harness-route-lib.mjs`) 수정만으로 충분 — 구조 변경 없음.

**한계**: `improvement`의 의미("동작은 하지만 더 낫게")와 "새 UI 요소를 상시 노출"(구조 추가에 가까움) 사이 의미 불일치가 생긴다. `CURRENT_FLOW_ANALYSIS`(플로우 분석)가 UI 구조 변경 요청에 적합한 entry state인지도 불확실 — `improvement`는 애초에 로직/성능 개선을 염두에 둔 워크플로다.

**거버넌스 분류**:

- meta-eval: 기존 `improvement` route의 `humanGateTokens`(`["spec", "po", "gate"]`, `clarify` 미포함)를 그대로 물려받으므로, 이 안 역시 **동일하게 clarify 미발동 경로를 새로 만든다** — 즉 안 A도 안 B와 동일하게 **APPROVAL_GATE_NARROWED weaken**이다. "신규 타입이 아니니 gate 영향 없다"는 판단은 틀렸다 — 어떤 키워드를 어느 타입에 추가하든, no-keyword-match(0.2/ambiguous) 케이스를 non-ambiguous 매칭으로 전환시키는 모든 변경은 동일한 weaken 성격을 가진다.
- Level: **L2** + weaken → ADR 필요는 안 B와 동일. 다만 신규 route/타입 경계 설계가 없어 **ADR 분량·검토 비용은 안 B보다 작다**.
- **PO가 이미 안 B를 채택**했으므로 이 안은 채택 대상이 아니라 비교 기준으로만 남긴다.

### 개선 후보 비교표

| 측면                  | 안 B (신규 `ui-ux` 타입, **PO 채택**) | 안 A (improvement 키워드 확장)        |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| 마찰 제거 정도         | 완전 (전용 entry state·write scope)    | 부분 (improvement의 플로우 분석이 UI 구조 요청과 의미 불일치) |
| gate 변경              | clarify 미발동 경로 신설               | 동일하게 clarify 미발동 경로 신설       |
| meta-eval weaken       | APPROVAL_GATE_NARROWED                 | APPROVAL_GATE_NARROWED (동일)           |
| ADR 필요               | 예 (본 회고 동반 초안 `0045`)          | 예 (분량 더 작음)                       |
| 개념적 정합성          | 높음 (UI 서술 전용 route·경계 명시)    | 낮음 (improvement 의미 오염)            |
| 수정 파일 수           | 2 (route-lib, route-manifest) + ADR    | 1 (route-lib) + ADR                     |
| **PO 결정**            | **채택**                               | 대안(비채택)                            |

### 4-3. 후보 (부차) — `harness-intake.mjs`에 `buildRoute()` 확장 필드 배선 [L1 후보, 신규 발견]

**발견 경위**: `git log`로 확인한 결과 2026-06-30 retro 안 B(bare task-ID 힌트)는 실제로 커밋됐다(`61860a1 chore(harness): route 에 bare task-ID 힌트 추가 (회고 2026-06-30 · 안 B)`). `scripts/harness-route-lib.mjs`의 `buildRoute()`(line 316-346)는 `reason`·`detectedPattern`·`detectedTaskId`·`suggestedNextStep`을 정상적으로 계산해 반환한다. `pnpm harness:route` (`scripts/harness-route.mjs` line 27, `console.log(JSON.stringify(route, ...))`)는 이 필드들을 그대로 출력한다.

**그러나** `scripts/harness-intake.mjs`(line 41-60)의 `runRecord` 객체는 `reason`·`detectedPattern`·`detectedTaskId`·`suggestedNextStep`을 **포함하지 않는다** — 수동으로 필드를 나열해 구성하기 때문에 `buildRoute()`가 새로 반환하기 시작한 필드가 누락됐다. 실제로 `evals/runs/2026-07-01T04-53-38-862-analysis-eval-0067-rn-공통-디자인-토큰-확장-착수.json`(EVAL-0067, bare task-ID 패턴 확실)을 열어보면 `detectedPattern` 필드 자체가 없다 — **코드는 계산하지만 로그는 저장하지 않는다.**

**영향**: (1) 안 B의 실효성을 `evals/runs/*.json`만으로는 검증할 수 없다(회고자가 소스 코드까지 봐야 발견 가능) — 회고 정확도 저하. (2) `reason` 필드 부재는 2026-06-26·2026-06-30 두 차례 회고에서 이미 지적된 동일 공백(§5)이 세 번째로 재확인됨.

**거버넌스 분류**:

- meta-eval: **neutral/strengthen** — 게이트·분류 로직 변경 없음, 이미 계산된 값을 로그에 추가 반영하는 순수 관측성(observability) 개선.
- Level: **L1 후보** — "traceability 링크 보정"에 가까운 기계적 필드 동기화. 단, `scripts/harness-intake.mjs`는 `harness-improvement` route의 `allowedWriteScopes` 밖이라 `apply-harness-update` 자동 PR 생성 시 `scripts/**` 스코프 명시가 필요하다(완전 무인 L1은 아님).
- 권장 라우트: `propose-harness-update`(neutral, scope: `scripts/**`) → 사람 승인(가벼운 리뷰) → `apply-harness-update`.
- ADR 불필요(weaken 없음).

### 전체 랭킹 (이번 집중 retro 한정)

| 순위 | 후보                                                     | 근거 지표                        | Level | meta-eval              | 권장 라우트                                          |
| ---- | ---------------------------------------------------------- | ----------------------------------- | ----- | ----------------------- | ------------------------------------------------------- |
| 1    | 안 B — 신규 `ui-ux` 타입 (PO 채택)                        | 1/24 촉발 + 7타입 전수 키워드 공백 확인 | L2    | weaken(APPROVAL_GATE_NARROWED) | ADR-0045 → propose-harness-update → PO 승인          |
| 2    | `harness-intake.mjs` 필드 배선 (§4-3)                    | 안 B(bare task-id) 실효성 검증 불가 확인 | L1    | neutral                 | propose-harness-update(scope: scripts/**) → 사람 승인 |
| 3    | `"adr"`/`"spec"` → `docs` 키워드 추가 (2026-06-26 후보3 재확인) | 2건/8건, 두 차례 회고 연속 미적용   | L1    | neutral                 | propose-harness-update → 사람 승인                    |
| 4    | `"측정"` → `analysis` 키워드 추가 (신규 관찰)             | 1건/8건                             | L1    | neutral                 | propose-harness-update → 사람 승인                    |

> 안 A(improvement 확장)는 §4-2에서 비교 목적으로만 다루고 순위에서 제외(PO가 이미 안 B로 확정).

---

## 5. 측정 공백

| 지표                                              | 상태                                                                                                             | 캡처 추가 시 건드려야 할 곳                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| run 파일에 `reason`·`detectedPattern` 등 미저장    | **세 번째 연속 확인**(2026-06-26 → 2026-06-30 → 본 회고). `buildRoute()`는 계산·반환하지만 `harness-intake.mjs`가 배선 안 함(§4-3, 신규 근거) | `scripts/harness-intake.mjs` line 41-60 `runRecord` 객체에 `reason`·`detectedPattern`·`detectedTaskId`·`suggestedNextStep` 추가 |
| EVAL-0052 완료 시각과 2026-06-30 retro 작성 시각의 선후 | 날짜(day) 단위만 기록돼 동일자(同日字) 배치 간 중복 포함 여부 확인 불가(§3)                                          | `agent-results.json` runs[] 항목에 `completedAt`(ISO timestamp) 필드 추가 고려                        |
| UI/UX 어휘 미스의 실제 재발률                       | n=1(최초 관측) — 향후 재발 빈도는 이번 배치로는 예측 불가, 다음 회고에서 재확인 필요                                | 다음 회고 시 `evals/runs/*.json` 신규분 재검사(신규 키워드 후보 추가 전까지는 여전히 no-keyword-match로 떨어질 것) |
| misroute 정정율(라우터 X, 실제 Y)                  | 측정 불가(캡처 부재). 2026-06-26·2026-06-30 retro와 동일 — 반복 확인, 아직 미해소                                    | `harness-intake.mjs` 또는 claim 시점에 `actual_classification` 필드 추가                              |

---

## 6. keep / revert (2026-06-30 retro 제안 효과)

| 2026-06-30 retro 제안                                            | 이번 배치 지표 영향                                                                                                                  | 판정                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 안 B — route 출력에 bare task-ID 힌트 추가(`detectedPattern` 등)    | **적용됨**(`git log` 확인: 커밋 `61860a1`, `scripts/harness-route-lib.mjs` line 316-342에 로직 존재, `pnpm harness:route` stdout에 노출). 그러나 `harness-intake.mjs`에 미배선(§4-3)이라 **persist된 run 로그로는 효과가 관찰되지 않음** | **부분 keep** — 코드는 keep, 로그 배선 후속 필요(§4-3 candidate로 승격) |
| 안 A — `existing-task` 전용 라우트 신설 (clarify 게이트 제거)       | 미적용                                                                                                                                  | **keep** (미적용 — PO 결정 대기 상태 유지)                              |
| 후보 3 — `orchestrate-backlog.md` bare task-ID 조항 추가            | 미적용                                                                                                                                  | **keep** (미적용)                                                       |
| (2026-06-26 유래) `"구현"`/`"분해해"`/`"adr"` 키워드 추가            | 미적용 — 이번 배치에도 ADR 어휘 미스 2건, 분해 변형 1건 재확인(§2-3)                                                                     | **keep** (미적용 — 세 번째 회고에서도 동일 패턴 재확인, 우선순위 상향 권고) |
| run JSON `reason`/`scores`/`matchedKeywords` 저장                    | 미적용. `detectedPattern` 등 신규 필드까지 포함해 여전히 배선 안 됨(§4-3에서 범위 확장 재확인)                                            | **keep** (미적용 — §4-3으로 구체화·재제안)                              |

**종합**: bare task-ID 패턴은 코드 수정(안 B)은 들어갔으나 로그 배선 누락으로 "적용했는데 측정이 안 되는" 상태다. 이는 2026-06-26 retro부터 지적된 "run JSON 필드 부족" 문제가 **새 기능이 추가될 때마다 함께 누락되는 구조적 습관**임을 시사한다 — `buildRoute()`가 반환하는 필드와 `harness-intake.mjs`의 `runRecord` 필드를 동기화하는 절차(또는 `...route` spread) 자체가 다음 회고의 우선 후보다.

---

## 다음 사람 액션 (PO 결정 문항)

1. **안 B(`ui-ux` 신규 타입) 승인 여부**: 동반 ADR(`docs/adr/0045-ui-ux-classification-type.md`, Status: Proposed)의 키워드 목록·route 설계를 승인하는가? (L2, weaken=APPROVAL_GATE_NARROWED, ADR 필수)
2. **`harness-intake.mjs` 필드 배선(§4-3) 우선 처리 여부**: `ui-ux` 타입 승인과 무관하게, `reason`·`detectedPattern` 등을 지금 바로 배선할 것인가? (L1, neutral — 안 B 채택 여부와 독립적으로 먼저 처리 가능)
3. **`allowedWriteScopes` 확장 여부**: `harness-improvement` route가 `scripts/**`·`.agents/workflows/**`를 아직 포함하지 않아, 매 제안마다 scope를 개별 명시해야 하는 마찰이 세 번째 회고에서도 반복 지적됐다. 확장할 것인가? (이 자체가 L2 + AUTONOMY_EXPANDED weaken → ADR 필요)
4. **`"adr"`/`"spec"`/`"측정"` 키워드 추가 우선순위**: 두 차례 연속 미적용된 저위험(neutral) 제안들을 이번엔 처리할 것인가?

---

> 이 proposal 은 PO 게이트 대기 — 적용은 사람 승인 후.
> 하네스 회고자는 진단·측정·후보 제시까지 수행한다. `.agents/**` · `scripts/**` · `route-manifest.json` 수정은 하지 않는다 (UPDATE_POLICY 원칙 8, 본 보고서 작업 범위).
