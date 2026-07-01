# ADR-0045: 하네스 라우터 `ui-ux` 분류 타입 신설

**Date**: 2026-07-01
**Status**: Accepted <!-- proposed / accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO) — 2026-07-01 설계 방향 확정(안 B 채택) + 최종 승인 완료("1번") → `chore/harness-ui-ux-classification` 적용

이 ADR은 with-key 하네스 자연어 요청 라우터(`scripts/harness-route-lib.mjs` · `.agents/workflows/route-manifest.json`)에 **UI(User Interface, 사용자 인터페이스) 컴포넌트를 명사로 서술하는 요청 전용 분류 타입 `ui-ux`를 신설**하는 결정을 기록한다. 이 문서는 **Accepted** 상태다 — PO 승인(2026-07-01, "1번")과 meta-eval(weaken `APPROVAL_GATE_NARROWED`)을 거쳐 `chore/harness-ui-ux-classification` 브랜치에 코드를 적용했다. 적용 상세와 제안 대비 차이는 아래 **적용 결과** 절 참조. push·merge는 사람 게이트로 남긴다(auto-merge 금지, `.agents/harness/UPDATE_POLICY.md` 원칙 8, self-maintaining ≠ self-directing).

## 적용 결과 (Applied 2026-07-01)

PO 승인 후 `chore/harness-ui-ux-classification` worktree 브랜치에 적용했다.

- **적용 파일**: `scripts/harness-route-lib.mjs`(`CLASSIFIER_KEYWORDS."ui-ux"` 추가) · `.agents/workflows/route-manifest.json`(`ui-ux` route 추가, `CURRENT_UI_ANALYSIS` entry) · `scripts/harness-route-lib.spec.mjs`(ui-ux 분류·라우팅·경계 테스트 3건 추가).
- **제안 대비 차이(중요)**: §Decision 1단 목록의 `다크모드`·`라이트모드`는 **적용에서 제외**했다. 기존 spec 테스트 `"다크모드 기능 추가해줘" → feature`와 tie(동점)를 일으켜 그 테스트를 깨뜨리기 때문이다(테스트 완화 금지 원칙 — ADR의 "1단 저충돌" 정성 판단이 놓친 실측 충돌을 테스트가 포착). 두 어휘는 2단(고충돌 `버튼·화면·모달·헤더·색상`)과 함께 관찰 후 별도 회고에서 재논의한다. **적용된 1단** = `네비게이션·내비게이션·뒤로가기·탭바·하단 탭·상단바·레이아웃·다이얼로그·토스트·정렬·여백·아이콘 배치·폰트·컬러톤·애니메이션·트랜지션`(16개).
- **검증**: `node --test scripts/harness-route-lib.spec.mjs` 전건 통과 · `harness:route "…네비게이션…뒤로가기…"` → `ui-ux`(confidence 0.8, ambiguous false) 확인.
- **남은 게이트**: push·PR·merge는 사람 몫(auto-merge 차단). meta-eval verdict `APPROVAL_GATE_NARROWED`(weaken) 기록 유지 — 회귀 시 §Consequences 완화책 참조.

## Context

배경과 현재의 빈틈을 정리한다.

- **2026-07-01 실제 미스라우트가 발생했다.** 요청 `"RN 앱 상단 네비게이션을 페이지마다 상시 보여주고 뒤로가기 버튼이 있으면 좋겠어"`가 `pnpm harness:intake`를 거쳐 `classification: "analysis"`, `confidence: 0.2`, `ambiguous: true`, `reason: "no-keyword-match"`로 폴백했다(`evals/runs/2026-07-01T08-06-29-064-analysis-rn-앱-상단-네비게이션을-페이지마다-상시-보여주고-뒤로가기-버튼이-있으면-좋겠어.json`).
- **원인은 어휘 공백이다.** `scripts/harness-route-lib.mjs`의 `CLASSIFIER_KEYWORDS`(line 24-70)를 7개 타입 전수 스캔한 결과, `네비게이션`·`뒤로가기`·`버튼`·`헤더`·`탭바`·`레이아웃`·`모달`·`화면`·`정렬`·`여백`·`아이콘`·`색상`·`폰트`·`스크롤`·`토스트`·`다이얼로그` 같은 UI 컴포넌트/레이아웃 명사가 **어디에도 없다.**
- **`improvement` 타입에 `"ux"` 키워드는 이미 있다**(line 42, `["개선", "더 쉽게", "ux", "성능", "리팩토", "리팩터", "불편", "최적화", "정리해"]`). 그러나 이는 사용자가 영문 약어 `UX`/`ux`를 문자 그대로 쓸 때만 매칭되고, 한글 명사(네비게이션, 버튼)로 서술하면 매칭되지 않는다 — 기존 키워드가 없는 게 아니라 **적용 범위가 좁다**.
- **`feature` 타입은 동사 위주다**(line 41, `["추가해", "새로 만들", "기능 넣", "지원하게", "만들어줘", "구현해줘", "새 기능"]`). 촉발 요청처럼 `"~있으면 좋겠어"`(암묵적 바람) 형태로 끝나는 요청은 명시적 생성 동사가 없어 매칭되지 않는다.
- **폴백 시 사람 게이트는 정상 작동했다.** `no-keyword-match`(line 145-153) → `ambiguous: true` → `buildRoute()`(line 311-314)가 `humanGateTokens`에 `"clarify"`를 강제 추가 — 실제 run 파일도 `humanGateTokens: ["clarify"]`를 기록했다. 즉 이번 건은 **silent misroute가 아니라 마찰(불필요한 확인 질문)**이다.
- **회고 근거**: [`evals/retro-reports/2026-07-01-retro-ui-ux-classification.md`](../../evals/retro-reports/2026-07-01-retro-ui-ux-classification.md) — 24건 run 표본 중 8건(33.3%)이 off-vocab이며, 이 중 1건이 UI 명사 서술형이다(최초 관측, n=1). 빈도 자체는 낮지만, 7개 타입 키워드 전수 스캔으로 확인한 **구조적 공백**이라 같은 패턴("~버튼이 있으면", "~헤더를 고정해줘")이 재요청될 때마다 동일하게 재발한다.
- **결정할 것**: 이 공백을 (a) 기존 `improvement` 키워드 확장으로 메울지, (b) 전용 신규 타입 `ui-ux`를 신설할지. PO는 2026-07-01 (b)를 채택 방향으로 확정했다 — 이 ADR은 그 설계를 구체화하고 트레이드오프를 기록한다.

## Decision

**하네스 라우터에 8번째 분류 타입 `ui-ux`를 신설한다.** UI 컴포넌트/레이아웃을 명사로 서술하며 시각적 변경을 요청하는 자연어 요청을 전담하며, 기존 `improvement`(동작 유지 + 흐름/성능 개선)와 `feature`(새 기능 추가 동사형)와는 구분된 별도 route로 처리한다.

세부 규칙·범위·예외:

- **경계 기준 — `ui-ux` vs `improvement` vs `feature`**:
  - `ui-ux` = 요청 안에 **UI 컴포넌트/레이아웃 명사**가 등장하고, 시각적 구조·배치·상시 노출 여부를 다룬다. 예: "네비게이션을 상시 보여줘", "버튼이 있으면 좋겠어", "탭바 순서를 바꿔줘".
  - `improvement` = 동작은 유지한 채 **흐름/성능**을 개선한다. UI 요소를 명사로 지목하지 않고 불편함을 서술한다. 예: "매 업로드마다 뜨는 확인 팝업이 불편해" (2026-06-25 실제 run, `improvement`로 정상 분류됨 — 이 경계 기준과 일치).
  - `feature` = **명시적 생성 동사**(추가해/만들어줘/구현해줘)로 새 기능·새 화면을 요청한다.
  - 세 타입 키워드가 한 요청에 동시 등장하면(예: "버튼 위치를 바꿔서 더 쉽게 눌리게 해줘" → `ui-ux` "버튼" + `improvement` "더 쉽게") 기존 `classifyRequest()` 랭킹 로직(line 180-197)이 동점(tie) 처리해 `ambiguous: true → clarify`로 안전하게 떨어진다 — 별도 우선순위 규칙 없이도 안전망이 유지된다.
- **`CLASSIFIER_KEYWORDS.ui-ux` 제안 키워드 집합** — 충돌 위험도로 2단 분리한다.
  - **1단(저충돌, 즉시 추가 권장)**: `네비게이션`, `내비게이션`, `뒤로가기`, `탭바`, `하단 탭`, `상단바`, `레이아웃`, `다이얼로그`, `토스트`, `정렬`, `여백`, `아이콘 배치`, `폰트`, `컬러톤`, `다크모드`, `라이트모드`, `애니메이션`, `트랜지션`. **왜 저충돌**: 기존 7개 타입 키워드 어디와도 부분 문자열이 겹치지 않고, 버그 리포트("~가 안 돼", "~가 깨짐")에 잘 동시 등장하지 않는 구조/스타일 서술 전용 어휘다.
  - **2단(고충돌, 보류 또는 후속 논의)**: `버튼`, `화면`, `모달`, `헤더`, `색상`. **왜 보류**: 이 단어들은 버그 리포트에도 흔한 일반어다(예: "버튼이 안 눌려요", "화면이 깨져요"). `classifyRequest()`는 단순 부분 문자열 매칭이라 "버튼" 단독을 넣으면 `bugfix` 요청과 스코어 동점이 발생할 잠재 위험이 있다(24건 표본에서 실측 충돌 사례는 0건 — 정성적 우려, §Consequences에서 완화책 제시). 촉발 요청의 `"버튼"`은 1단 키워드(`뒤로가기`)만으로도 이미 `ui-ux` 매칭이 성립하므로, 2단 어휘 없이도 이번 케이스는 해결된다 — 고충돌 어휘는 **1단 적용 후 관찰 기간을 거쳐 별도 회고에서 추가 여부 재논의**한다.
- **PRIORITY_RULES 불필요** — `ui-ux`는 `harness-improvement`/`prd`처럼 다른 타입을 강제로 덮어써야 하는 "정책 오버라이드" 타입이 아니라 `bugfix`/`feature`/`improvement`와 동급인 "콘텐츠 타입"이다. 기존 점수 랭킹(line 180-197)만으로 충분하고, 신규 `PRIORITY_RULES` 엔트리는 추가하지 않는다.
- **`route-manifest.json` 신규 route 제안**:

  ```json
  "ui-ux": {
    "label": "ui-ux-flow",
    "targetWorkflow": ".agents/workflows/implement-agent-task.md",
    "taskCreation": ".agents/workflows/create-agent-tasks.md",
    "entryState": "CURRENT_UI_ANALYSIS",
    "humanGateTokens": ["spec", "po", "gate"],
    "maxRepairAttempts": 3,
    "allowedWriteScopes": ["evals/tasks/**", "apps/**", "packages/**"],
    "blockedActions": []
  }
  ```

  - `entryState: "CURRENT_UI_ANALYSIS"`는 `improvement`의 `CURRENT_FLOW_ANALYSIS`(흐름 분석)를 UI 특화로 미러링한 신규 진입 상태다 — 코드 변경 전 **현재 화면 구현 + 디자인 토큰**(`apps/mobile/src/shared/{theme,ui}/**`, `apps/web/src/components/ui/**`)을 먼저 읽고, ADR-0044(RN 화면 시각 parity)가 이미 정의한 parity 원칙과 충돌하지 않는지 확인하는 단계로 정의한다.
  - `humanGateTokens`는 `improvement`와 동일(`["spec", "po", "gate"]`, `clarify` 미포함 — `clarify`는 `buildRoute()`가 `ambiguous` 판정 시에만 동적으로 추가하는 것이지 route 고정 필드가 아니다).
  - `allowedWriteScopes`는 `improvement`와 동일하게 `apps/**`·`packages/**`·`evals/tasks/**`로 둔다(웹·모바일 양쪽 UI 변경 가능성을 열어둠).
- **(선택) `DOMAIN_KEYWORDS`/`domainContext` 보강** — 필수는 아니나, `ui` 도메인 슬러그를 추가해 `apps/mobile/src/shared/{theme,ui}/**`·`apps/web/src/components/ui/**`를 `requiredContext`에 자동 포함시키는 안을 후속 검토 대상으로 남긴다. 분류 게이트 자체와는 독립적인 개선(단순 컨텍스트 파일 추천)이라 이 ADR의 핵심 결정에는 포함하지 않는다.
- **적용 순서** — (1) 본 ADR 승인 → (2) `propose-harness-update`가 `scripts/harness-route-lib.mjs` + `route-manifest.json` 변경분을 PR 초안으로 작성(스코프: `scripts/**` · `.agents/workflows/**` 명시 필요, 현재 `harness-improvement` route의 `allowedWriteScopes`는 `.agents/harness/**`·`evals/meta/**`·`docs/adr/**`만 포함) → (3) meta-eval이 weaken(APPROVAL_GATE_NARROWED)로 분류 → (4) **PO 승인** → (5) `apply-harness-update`. auto-merge 금지.

## Alternatives Considered

### 1. `improvement` 키워드 확장 (신규 타입 없음)

- **Pros**: 파일 1개(`scripts/harness-route-lib.mjs`)만 수정, 구조 변경 없음, 검토 비용 최소.
- **Cons**: `improvement`의 의미("동작은 유지, 흐름/성능 개선")와 "UI 요소를 상시 노출/재배치"(구조 변경에 가까움) 사이 의미 불일치. `CURRENT_FLOW_ANALYSIS` entry state가 UI 구조 요청에 부적합(플로우 분석 ≠ 화면 구조 분석). 또한 `improvement` route의 `humanGateTokens`를 그대로 물려받으므로 **이 안도 동일하게 APPROVAL_GATE_NARROWED weaken**이다 — "신규 타입이 아니니 게이트 영향이 적다"는 판단은 틀렸다(회고 §4-2에서 상세 검증).
- **Why not**: gate 영향은 동일한데 개념적 정합성만 떨어진다. PO가 신규 타입(안 B)을 명시적으로 채택했다.

### 2. 현행 유지 (키워드 미추가, 매번 clarify로 사람이 판단)

- **Pros**: 코드 변경 없음, meta-eval weaken 없음, ADR 불필요.
- **Cons**: 같은 패턴이 재요청될 때마다 매번 "이거 UI 개선 맞나요?" 확인이 필요 — bare task-ID 패턴(2026-06-30 retro)과 동일한 종류의 반복 마찰이 구조적으로 남는다. n=1이라 당장은 비용이 작지만, RN 화면 전환(ADR-0044) 작업이 늘어날수록 UI 서술형 요청 빈도도 늘어날 가능성이 높다(정성적 예측, 실증 아님).
- **Why not**: 근본 원인(7개 타입 전수 키워드 공백)을 그대로 방치하는 안이라, 이미 확인된 구조적 문제를 "언젠가 회고에서 다시 논의" 상태로 미루는 것과 같다.

### 3. 정규식 기반 복합 조건(명사+동사 결합) 분류 확장

- **Pros**: "버튼" 단독이 아니라 "버튼 + 있으면 좋겠어" 같은 결합 패턴만 매칭하면 `bugfix`와의 충돌 위험을 원천 차단할 수 있다(bare task-ID 패턴의 `EVAL-\d+` regex 방식과 유사).
- **Cons**: `classifyRequest()`의 현재 알고리즘(단순 키워드 카운트 랭킹)을 벗어난 특수 로직이 필요해 유지보수 비용이 늘고, 다른 6개 타입과 설계가 비대칭해진다.
- **Why not**: 1단 저충돌 키워드 목록(§Decision)만으로 촉발 케이스를 포함한 대부분의 실사용 패턴을 커버할 수 있어, 복합 조건 도입은 2단 고충돌 어휘(버튼/화면)를 나중에 추가할 때 재검토할 후속 옵션으로 남긴다.

## Consequences

### 긍정적

- UI 컴포넌트 명사 서술형 요청이 clarify 없이 `CURRENT_UI_ANALYSIS`로 직행 — bare task-ID 패턴과 동급의 반복 마찰 하나를 구조적으로 해소한다.
- `improvement`/`feature`의 의미를 오염시키지 않고 UI 서술 전용 경계를 명시적으로 분리한다.
- ADR-0044(RN 화면 시각 parity)·동반 spec(`2026-07-01-rn-screen-parity-acceptance`)이 이미 정의한 화면별 parity 작업과 자연스럽게 연결된다(`CURRENT_UI_ANALYSIS`가 parity 원칙 확인을 요구).

### 부정적 / 비용

- **meta-eval weaken (APPROVAL_GATE_NARROWED)** — 현재는 UI 명사 단독 요청이 100% clarify를 거친다. `ui-ux` 신설 후에는 단일 키워드 매칭만으로 `confidence 0.7, ambiguous: false`가 되어 clarify가 발동하지 않는 경로가 새로 생긴다. 이는 사람 승인 표면이 좁아지는 것이므로 ADR + PO 승인 없이는 적용 불가.
- **false-positive 위험(정성적)** — 1단 키워드는 저충돌로 설계했으나, 향후 2단 어휘(`버튼`·`화면`) 추가 시 `bugfix`와의 동점 충돌 가능성이 존재한다. 완화책: (a) 2단 어휘는 이번 ADR 범위에서 제외, (b) 도입 후 최소 1회 회고에서 실측 충돌 빈도 확인 후 재논의, (c) 동점 발생 시 기존 알고리즘이 `ambiguous: true`로 안전하게 떨어지므로 최악의 경우도 "불필요한 clarify 1회 추가"이지 silent misroute가 아니다.
- **경계 판단 비용** — "UI 명사가 등장하면 무조건 ui-ux"가 아니라 실제로는 `improvement`/`feature`와 겹치는 회색지대 요청이 존재할 수 있다. 동점 시 clarify로 위임하는 것이 유일한 안전장치이므로, 리뷰어가 route 결과를 맹신하지 않고 확인하는 습관이 계속 필요하다.

### 후속 영향

- **동반 회고** — [`evals/retro-reports/2026-07-01-retro-ui-ux-classification.md`](../../evals/retro-reports/2026-07-01-retro-ui-ux-classification.md)가 이 ADR의 진단·근거·대안 비교의 원 데이터를 담고 있다.
- **적용 시 `propose-harness-update` scope 확장 필요** — `scripts/harness-route-lib.mjs`(키워드 로직)와 `route-manifest.json`(route 엔트리)이 `harness-improvement` route의 현행 `allowedWriteScopes`(`.agents/harness/**`·`evals/meta/**`·`docs/adr/**`) 밖이므로, propose 단계에서 `scripts/**`·`.agents/workflows/**`를 명시적으로 추가해야 한다.
- **2단 고충돌 어휘 재논의** — `버튼`·`화면`·`모달`·`헤더`·`색상`은 1단 적용 후 관찰 기간(최소 1회 회고)을 거쳐 실측 충돌 빈도를 확인한 뒤 별도 결정한다.
- **`harness-intake.mjs` 로그 배선 점검** — 회고에서 별도로 발견된 이슈(`buildRoute()`가 계산하는 `reason`·`detectedPattern` 필드가 `evals/runs/*.json`에 저장되지 않음)는 `ui-ux` 신설과 무관하게 선행 처리하면, 신설 이후 `ui-ux` 분류 히트율을 다음 회고에서 정확히 측정할 수 있다.

## 용어집

- **ADR (Architecture Decision Record)**: 되돌리기 비용이 큰 결정을 근거와 함께 남기는 기록.
- **ambiguous**: 하네스 라우터의 분류 신뢰도가 임계값(0.6) 미만이거나 여러 타입이 동점으로 매칭된 상태. `humanGateTokens`에 `"clarify"`가 자동 추가된다.
- **APPROVAL_GATE_NARROWED**: `.agents/harness/UPDATE_POLICY.md`의 meta-eval weaken reason-code 중 하나. 사람 승인이 필요했던 경로가 자동 진행 경로로 바뀔 때 붙는다.
- **CURRENT_UI_ANALYSIS**: 본 ADR이 제안하는 `ui-ux` route의 진입 상태. 코드 변경 전 현재 화면 구현·디자인 토큰을 먼저 읽는 단계.
- **meta-eval**: 하네스 자기변경 제안이 strengthen/neutral/weaken 중 어디에 해당하는지 판정하는 게이트(UPDATE_POLICY D11).
- **no-keyword-match**: `scripts/harness-route-lib.mjs`가 7개 분류 타입 키워드 중 어느 것도 매칭되지 않을 때 반환하는 `reason` 값. `classification: "analysis"`, `confidence: 0.2`, `ambiguous: true`로 강제 폴백한다.
- **PO (Product Owner)**: 제품 결정권자. 하네스 라우팅 기준 변경의 최종 승인 게이트.
- **UI (User Interface)**: 사용자가 직접 보고 조작하는 화면 요소(버튼·네비게이션·레이아웃 등).
- **UX (User Experience)**: 사용자가 제품을 사용하며 느끼는 경험 전반. `improvement` 타입의 기존 `"ux"` 키워드가 다루는 영역.
