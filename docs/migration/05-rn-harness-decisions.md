# fromwith RN MVP — Harness Decisions (하네스 설계 결정 — grill-resolved)

> **Author**: pistachio8 (PO) · **Date**: 2026-06-04 · **Status**: Draft v0.1
> **Stakeholders**: FE(RN) · BE(Supabase) · QA · 디자이너 · 법무 · AI 코딩 에이전트(Claude Code · Codex · Cursor)
>
> **Pre-read** (이 문서를 읽기 전에):
>
> - [00-rn-conversion-plan](./00-rn-conversion-plan.md) — _무엇을_ 재사용/재작성하나(인벤토리)
> - [01-rn-mvp-prd](./01-rn-mvp-prd.md) — RN MVP가 _무엇을_ 만드나(P0 포팅 + P1 정산 + P2 자동검증)
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 기능 1건을 _어떻게_ 반복 빌드·검증하나(루프 + eval 게이트)
> - [03-rn-migration-rules](./03-rn-migration-rules.md) — 레이어별 전환 규칙
> - [04-rn-architecture](./04-rn-architecture.md) — 신규 RN 프로젝트 구체 아키텍처(A1~A12)
>
> **이 문서의 역할**: 02~04가 하네스의 _기계_(루프·레이어·아키텍처)라면, 이 문서는 **"본격 설계/구현 전에 고정해야 할 12개 의사결정(D1~D12)"을 grill-me 압박 점검으로 확정한 결정 기록**이다. 02·03·04를 가로지르는 cross-cutting 결정과, 그 위에 새로 세운 **두 축 개념 모델**(§1)·**저장 맵**(§2)·**meta-eval 반-침식 장치**(§6)를 담는다. 02~04와 중복 명세하지 않고 인용하며, 정합이 필요한 지점은 §9 후속 정합에 명시한다. 코드 변경은 없는 설계 문서다.

---

## 0. 한 줄 요약

> 이 하네스는 **fromwith RN 전환 전용**으로 짓는다(범용 템플릿화는 두 번째 프로젝트가 실재할 때 추출). 포팅(P0)과 신기능(P1/P2)을 **한 셸 + 다형 게이트**로 돌리고, 제품 의도(PRD/Story)는 코드·하네스 어느 자율 행위로도 덮이지 않게 **권한 경계와 반-침식 미늘**로 보호한다. 아티팩트는 **분해 spine + 직교 결정 레이어** 두 축으로 정리하고, drift는 **기존 `evals/` 위의 또 하나의 eval**로 감지한다.

### 0.1 결정 요약표 (D1~D12)

> **상태** 범례 — `확정`: 채택 즉시 적용 / `ADR`: `docs/adr/` 기록 필요(되돌리기 비쌈) / `spec`: `docs/superpowers/specs/` 설계 결정 필요. **라운드** — grill 1차(구조) / b차(개념·저장·자기유지).

| #   | 영역            | 결정                                                                                                       | 상태 | 라운드 | 본문 |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------- | ---- | ------ | ---- |
| D1  | 하네스 범위     | **전용 우선, 범용 추출은 rule-of-three로 연기.** 지금은 "프로젝트 변수 vs 구조"만 글로 구분                | 확정 | 1      | §8   |
| D2  | 트랙·게이트     | **한 셸 + 다형 Verify 게이트.** Define `port\|greenfield` 태그로 분기                                      | 확정 | 1      | §3   |
| D3  | 유지 SoT        | **PRD·Job Story·Engineering Story·Agent Task** 4종을 영속 SoT로(협업자 가시성)                             | 확정 | 1      | §2   |
| D4  | SoT 우선순위    | **2축 규칙.** 의도충돌=상위문서(PRD>Eng>Job), 현실충돌=Agent Task eval 중재                                | 확정 | 1      | §5   |
| D5  | 원자 단위       | **2-tier WP⊃AT.** WP=1 worktree=1 PR, AT=에이전트 1 one-shot. 크기 oracle=pass@3                           | 확정 | 1      | §4   |
| D6  | 자기유지 권한   | **권한 경계 3단(self-maintaining ≠ self-directing).** 자율/제안+사람/절대금지                              | 확정 | 1      | §6   |
| D7  | drift 감지      | **drift = 또 하나의 eval(기존 `evals/`).** 이벤트앵커 3 + 주기 sweep, 결정론 floor 우선                    | 확정 | 1      | §7   |
| D8  | PM 플러그인     | **optional adapter.** 아티팩트 *계약*에만 하드 의존, 부재 시 스켈레톤 fallback                             | 확정 | 1      | §8   |
| D9  | 개념 모델       | **두 축** — 분해 spine + 직교 결정 레이어(spec/ADR). Eng Story≠dev spec≠spec/ADR                           | 확정 | b      | §1   |
| D10 | 저장 맵         | Job Story→`docs/stories/` · **Eng Story→`docs/eng-stories/`(신규)** · Agent Task→`evals/tasks/` · spec/ADR | 확정 | b      | §2   |
| D11 | meta-eval       | **단방향 반-침식 미늘.** weaken reason-code enum + PO ADR 게이트 + append-only. _품질 판정 아님_           | spec | b      | §6   |
| D12 | greenfield 임계 | **게이트 파라미터화** — 구조 지금, θ/G2 값은 G1/G2 확정 시 주입. θ-의존 task는 `blocked`                   | 확정 | b      | §3   |

---

## 1. 두 축 개념 모델 (D9)

하네스가 다루는 아티팩트는 한 줄(spine)이 아니라 **두 축**이다. 이 구분이 없으면 "Engineering Story = 개발 스펙 = ADR" 같은 conflation이 반복되고, 저장 위치·추적성·drift가 모두 흔들린다.

### 1.1 다이어그램

```text
[분해 spine — 위→아래로 점점 구체·작아짐. 실행 가능한 일에 수렴]
Product Context → PRD → (Test Scenarios ∥ Job Stories) → Engineering Stories → Work Packages → Agent Tasks(개발 스펙)
                                                              │ cites(인용)
                                                              ▼
[결정 레이어 — spine과 직교(orthogonal). "무엇을 짓나"가 아니라 "무엇을 골랐나"]
                                                        spec / ADR
```

- **분해 spine(수직)**: 위 레이어를 더 구체적·작은 단위로 정련. 아래로 흐른다.
- **결정 레이어(직교)**: `spec`/`ADR`. spine 위에 있지 **않다**. *선택*과 근거·결과를 기록하고, spine의 어느 노드(Engineering Story 이하)든 결정을 *인용*만 한다. 결정은 spine 노드가 되돌리기 비싼 선택을 강제할 때 생성된다.

### 1.2 세 레이어 정밀 정의 + 경계 판별식

| 레이어                   | 한 줄 정의                                                      | 답하는 질문                                       | 종류         | 언어                        |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------- | ------------ | --------------------------- |
| **Job Story**            | "When [상황], I want [동기], so [결과]"                         | **누가·왜** 필요로 하나                           | 의도(intent) | 사용자 언어(감정·상황)      |
| **Engineering Story**    | "[결과]를 위해 시스템은 [기술 변경]을 해야 한다, [제약] 때문에" | **시스템이 무엇이 되어야** 하나 + 엔지니어링 _왜_ | 작업-서사    | 시스템 언어(테이블·RPC·RLS) |
| **개발 스펙=Agent Task** | "[X]를 지어라; [eval 기준] 통과 시 done"                        | **정확히 무엇을 짓고 어떻게 검증**                | 작업-계약    | 실행 계약(prompt+eval)      |

**경계 판별식** (어디서 선이 갈리나):

- **Job ↔ Eng = _언어_.** 감정·상황이면 Job("안 하면 잃는다는 압박을 느끼고 싶다"). 테이블·RPC·불변식이면 Eng("hold/release를 append-only 원장에 기록, 잔액=Σdelta").
- **Eng ↔ Agent Task = _실행 가능성·입도_.** Eng Story는 여러 WP에 걸친 서사+근거로 _직접 실행 불가_. Agent Task는 pass/fail eval을 가진 단일 실행 계약으로 _에이전트 1패스로 실행 가능_.
- **Eng Story ↔ spec/ADR = _종류_.** Eng Story = _지을 일_(work). spec/ADR = _내린 선택_(decision). Eng Story가 ADR을 인용, ADR은 work로 분해되지 않는다.

### 1.3 fromwith P1(보증금)로 전 레이어 관통 예시

| 레이어                          | 인스턴스                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PRD AC**                      | P1-1: 서약 시 보증금 hold, 잔액 부족 시 차단([01 §5.C](./01-rn-mvp-prd.md))                                                                                                       |
| **Test Scenario**               | Given 잔액부족 user, When 서약, Then 차단 + grant 안내                                                                                                                            |
| **Job Story**                   | "보증금을 걸어 '안 하면 잃는다'는 실제 압박을 느끼고 싶다"                                                                                                                        |
| **Engineering Story**           | "정산을 금전성·감사가능하게 하려고, 시스템은 hold/release/forfeit을 append-only `point_ledger`로 기록하고 잔액을 Σdelta로 도출해야 한다 — RLS self+그룹 read, write는 서버 RPC만" |
| **spec/ADR** (직교, Eng이 인용) | "ADR — `point_ledger`를 mutable balance 대신 append-only 이벤트소싱으로. 왜: 금전성·분쟁추적. 되돌리기 비쌈"                                                                      |
| **Work Package**                | "P1 원장 + hold/release" (1 worktree/PR)                                                                                                                                          |
| **Agent Task(개발 스펙)**       | "EVAL-00XX: `point_ledger` 마이그레이션 + hold RPC. 수용기준: 잔액=Σdelta 불변식 test, 이중 hold 차단, RLS 역할별 실측"                                                           |

> **한 줄**: Eng Story는 "**금전성이라 원장이 필요하다**"(지을 일+왜), ADR은 "**mutable 대신 append-only로 정했다**"(내린 결정), Agent Task는 "**이 마이그레이션을 짜고 불변식 test로 검증한다**"(실행 계약). 셋이 명백히 다르다.

---

## 2. 저장 맵 (D3·D10)

두 축을 물리적 위치로 떨어뜨린다. **유일한 신규 집은 `docs/eng-stories/`** 이고, 나머지는 전부 기존 컨벤션을 쓴다.

| 레이어                | 축         | 종류                                 | 집                                          | 상태                                          |
| --------------------- | ---------- | ------------------------------------ | ------------------------------------------- | --------------------------------------------- |
| PRD                   | spine      | 의도                                 | `docs/migration/01-*` (+ POC `docs/PRD.md`) | 기존                                          |
| Test Scenarios        | spine      | 검증 뷰                              | → **Agent Task eval 기준에 접힘**(아래)     | 컨벤션 신설(기존 파일 grandfather)            |
| Job Story             | spine      | 사용자 의도                          | `docs/stories/`                             | 기존([01 §5.A](./01-rn-mvp-prd.md))           |
| **Engineering Story** | spine      | 작업-서사                            | **`docs/eng-stories/` (신규)**              | **신규 디렉토리**                             |
| Work Package          | spine      | (D5) 파일 없음 = 브랜치/PR/eval task | —                                           | 확정                                          |
| Agent Task(개발 스펙) | spine leaf | 작업-계약                            | `evals/tasks/0004-*`                        | 기존([02 §5.4](./02-rn-migration-harness.md)) |
| **spec/ADR**          | **직교**   | 결정                                 | `docs/superpowers/specs/` + `docs/adr/`     | 기존                                          |

### 규칙

- **Engineering Story = `docs/eng-stories/`** — 에픽/기능 단위(1 Eng Story → N Work Package). PRD AC를 상향 인용 + spec/ADR을 직교 인용 + Work Package들을 spawn. **기존 [00-plan](./00-rn-conversion-plan.md)·[04-architecture](./04-rn-architecture.md)는 "프로젝트 전체 Engineering Story"로 grandfather**(이미 쓰인 foundational 서사). 앞으로의 _기능별_ Engineering Story만 여기 추가한다. **왜 별도 디렉토리**: `docs/stories/`(Job)와 `docs/eng-stories/`(Eng)의 대칭이 "셋은 다르다"(§1)를 가장 정직하게 보존. Work Package가 파일이 없으니(D5) Engineering Story가 spine에서 "Work Package 바로 위 유일한 서사 노드"라 자기 집이 필요.
- **Test Scenarios = eval 기준에 접힘** — Job/Eng Story와 달리 PRD AC와 1:1, 의미 간극이 0이다(같은 동작을 QA 언어로 표현). 그래서 별도 SoT로 두지 않고 **Agent Task eval 파일의 수용기준으로 흡수**한다(QA는 거기서 읽음 — eval task 파일은 QA-readable). **왜**: drift 표면을 안 늘림. ⚠️ 단 기존 `docs/stories/2026-06-02-photo-verification-test-scenarios.md`는 grandfather(소급 이동 안 함). 새 기능부터 이 컨벤션 적용.
- **드리프트 묶음 = 물리적 co-location이 아니라 citation + D7 체크.** 각 spine 파일이 위 1줄 인용(Agent Task → Engineering Story → Job Story → PRD AC) + Engineering Story·Agent Task가 spec/ADR 직교 인용. [§7](#7-drift-감지-d7) 체크가 "인용이 아직 resolve되나 / 의도가 일치하나"를 Define·Record·sweep에서 검사.

> **대가의 정직한 기록**: D3가 Story를 영속 SoT로 두고 D10이 Engineering Story에 자기 디렉토리를 줘서, 유지 SoT가 **4 클러스터**(PRD+stories / eng-stories / eval tasks / specs+adr)가 됐다. drift 표면이 "병합"보다 크다. 이게 "셋은 다르다"를 고집할 때의 가격이며, 완화는 citation+D7이지 *제거*가 아니다([§9 리스크](#94-설계-리스크-빌드-중-감시)).

---

## 3. 트랙 구조 + 다형 게이트 (D2·D12)

포팅(P0)과 신기능(P1/P2)은 **한 하네스 셸**을 공유하되 Verify 게이트만 트랙별로 다르다. 02의 마이그레이션 루프가 *마이그레이션 모양*이라(Extract→Port가 기존 코드 전제), 보존할 baseline이 없는 greenfield(P1/P2 신규 테이블)에 보존 eval을 강제하면 공허하거나 거짓 차단이 된다.

### Define에서 트랙 태그 1개

- **공유(한 시스템)**: worktree 격리·에이전트 역할 분리([02 §3](./02-rn-migration-harness.md)), append-only Record 로그, Wire의 RLS 경계 검증, Verify→Review→Release 골격.
- **`port` 트랙**(P0 포팅): Extract/Port = 기존 도메인 추출 + UI 매핑. **Verify = 보존 eval(pass^k=100%) + capability eval**.
- **`greenfield` 트랙**(P1/P2 신기능): Extract/Port = `packages/domain`에 **새 도메인 모듈을 test-first(TDD)로 작성**. **Verify = 보존 eval 생략 + 제품 정확도 게이트 + capability eval**.

> **태그가 Q7(마이그레이션·신기능 혼선) 방지장치**다. 혼선은 "Define에서 태그를 안 붙여서" 생긴다. 태그를 PR 템플릿·eval task 헤더에 강제 노출한다([§9 리스크](#94-설계-리스크-빌드-중-감시)).

### greenfield 게이트 파라미터화 (D12)

greenfield 게이트의 일부 임계값은 PRD Open Q로 아직 미확정이다([01 §0 G1/G2](./01-rn-mvp-prd.md), [01 §7 Q1·Q2](./01-rn-mvp-prd.md)). **게이트 *구조*는 지금 박고, *값*은 나중 주입**한다.

| 게이트 항목                   | 종류           | 지금                  | 나중                      |
| ----------------------------- | -------------- | --------------------- | ------------------------- |
| `잔액 = Σdelta` (원장 불변식) | 결정론         | **즉시 활성**         | —                         |
| `이중정산 없음` (idempotency) | 결정론         | **즉시 활성**         | —                         |
| `false_flag_rate ≤ θ` (P2)    | 임계 의존      | 구조만(θ=placeholder) | **G1 PoC 확정 시 θ 주입** |
| `G2_legal_signoff == true`    | boolean 게이트 | 구조만(false)         | **법무 통과 시 flip**     |

- θ-의존·G2-의존 기능의 eval task는 **[02 §6.1](./02-rn-migration-harness.md)대로 `blocked`** 로 둔다(G1/G2 통과까지). 결정론 불변식은 즉시 활성이므로 P1 원장 작업은 진행 가능.
- **왜**: 값이 없다고 하네스 설계 전체를 멈추지 않는다. 추측 임계를 박으면 거짓 통과/차단이 금전성·신뢰에 직격하므로([01 §3 F1](./01-rn-mvp-prd.md)) 추측하지 않는다.

---

## 4. 원자 단위 — WP ⊃ AT (D5)

[02 §4](./02-rn-migration-harness.md)의 루프 단위("한 기능")와 "에이전트는 Agent Task 1개만 수행"은 크기가 다르다. 2-tier로 분리하되 최소로 둔다.

| 단위                 | 정의                                                                                                         | 소비자               |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| **Work Package(WP)** | 1 worktree = 1 브랜치 `feat/rn-<feature>` = develop 1 PR = 마일스톤상 응집된 기능. eval task 파일 1개가 붙음 | 사람·PR 리뷰         |
| **Agent Task(AT)**   | 그 worktree 안에서 에이전트 1개가 한 번의 Define→Verify를 도는 단위. WP 1개 = AT 1~N개                       | 에이전트·eval-runner |

- **크기 oracle = pass@3 자체.** 줄 수로 추측하지 않는다 — AT가 3번 시도로 그 WP의 capability eval을 green 못 만들면 **너무 큰 것 → 분할**([02 §5.3](./02-rn-migration-harness.md)). 실무 휴리스틱: 1 AT ≈ 한 레이어 슬라이스(1 feature/api 또는 1 capability) + eval로 확인 가능한 결과 1개 + 컨텍스트 윈도우 1개 분량.
- **파일은 WP당 eval task 1개**(append-only)지만 그 안에 AT 프롬프트들을 나열. 파일 증식 없음.
- **에이전트에 핸드오프되는 건 오직 AT 1개.** Story·PRD는 절대 "태스크"로 핸드오프되지 않는다 → "Story를 구현 단위로 착각"이 구조적으로 불가능.

---

## 5. SoT 우선순위 — 2축 규칙 (D4)

PRD / Job Story / Engineering Story / 코드가 어긋날 때, **단일 승자는 틀린 질문**이다. 충돌은 두 종류이고 종류마다 승자가 다르다.

- **의도 충돌(문서 vs 문서)**: 상위가 이긴다 — **PRD > Engineering Story > Job Story**. 하위 문서가 틀린 것.
- **현실 충돌(문서 vs 코드)**: **Agent Task의 eval 수용기준이 중재**한다.
  - 코드가 eval 기준을 통과 → "코드 = 현재 현실", 어긋난 _서술_ 문서는 stale → drift report([§7](#7-drift-감지-d7)).
  - 코드가 eval 기준을 실패 → "코드 = 버그", 코드 수정.
  - **단 PRD의 *의도*는 코드에 절대 양보하지 않는다.** 코드에 밀려 stale 처리되는 건 _서술적_ 문서(Story의 동작 묘사·README)뿐.
- **Story를 노후화에서 지키는 규율**: Story는 *의도(why/what-for)*에만 권위가 있고 *코드가 지금 뭘 하는지*엔 권위가 없다. 그래서 Story는 코드가 바뀔 때마다가 아니라 **의도가 바뀔 때만**(PO 주도, 드묾) drift한다 — 이것이 4 클러스터 SoT(§2)의 무한 drift를 막는 유일한 길.

---

## 6. self-maintaining 권한 경계 (D6) + meta-eval (D11)

하네스가 drift report만이 아니라 **update proposal**까지 만든다면, 가장 큰 위험은 "에이전트가 stale 문서를 고친다며 PRD를 코드에 맞춰 다시 써서 scope creep을 공식 의도로 세탁"하는 것이다. **self-maintaining ≠ self-directing**.

### 6.1 권한 경계 3단 (D6)

| 행위              | 무엇                                                                            | 누가 결정   |
| ----------------- | ------------------------------------------------------------------------------- | ----------- |
| **자율 편집**     | eval 결과 `runs[]` append, drift _report_ 생성(읽기전용), 파생 뷰 기계적 동기화 | 하네스 자율 |
| **제안(PR+사람)** | 하네스 _구조_ 변경(rules·loop·게이트), _stale 서술 문서_ 수정                   | 사람 승인   |
| **절대 금지**     | PRD 의도, Job/Eng Story 의도, G1/G2, scope/non-goals, **eval 수용기준(계약)**   | PO 전용     |

- **방향-drift 차단 비대칭**: 코드 ↔ _의도 문서_ drift는 항상 "코드 의심" 기본값. 코드 ↔ _서술 문서_ drift만 "문서 stale, 자동 노트 안전". §5 2축 규칙과 포개진다 → 하네스가 코드 현실을 의도로 세탁하는 경로 자체가 없다.
- **drift report = 선택지 제시이지 해소가 아님**: "PRD는 X, 코드는 Y" 깃발만 꽂고, 해소는 항상 사람(코드 버그면 코드 수정 / 의도 변경이면 PO가 의식적으로 PRD 갱신).

### 6.2 meta-eval — 단방향 반-침식 미늘 (D11)

하네스가 _자기 자신_(loop·게이트·rules·drift 기준·SoT 우선순위·자율범위)을 바꾸는 건 최고위험이다. meta-eval이 이를 게이트한다.

> **Scope (못박음)**: meta-eval은 **"더 좋은 하네스인가" 판정기가 아니라 "하네스가 스스로 약해지나" 탐지기**다. 강화/중립 변경은 자유 통과(일반 리뷰만), 약화만 차단. **품질 판단은 PO/사람 몫.** _하네스는 자기 도구를 날카롭게 갈 순 있어도, PO 명시 동의 없이 무디게 만들 순 없다._

하네스 변경 제안(= 하네스 mechanics 파일 diff)이 통과해야 할 것:

1. **변경 분류(strengthen | neutral | weaken)** — 결정론 분류기로 각 변경을 분류.
2. **비대칭 게이트** — `weaken` 1건이라도 있으면 **ADR + PO 명시 승인 + 근거 기록** 요구, auto-merge 차단. strengthen/neutral은 일반 바(neutral은 "semantics unchanged" 근거 1줄).
3. **보존 재실행(분류기 입력)** — 제안된 rules 하에서 현재 코드에 기존 보존 eval 스위트 재실행. red면 "왜"를 분류(체크 제거/비활성=`EVAL_*` weaken / 더 엄격=strengthen). **독립 차단이 아님** — 정당한 강화를 막지 않음.
4. **D1~D8 정합 lint** — 제안이 불변식·개념 모델을 깨나(예: "PRD 의도 자율 편집 허용"=D6 위반 → auto-reject / "Eng Story를 dev spec에 병합"=§1 위반 → flag).

**weaken reason-code enum** (자유 텍스트 금지 — 감사·승인 매핑·패턴 탐지 위해):

| reason code                      | 무엇                           |
| -------------------------------- | ------------------------------ |
| `THRESHOLD_LOWERED`              | pass^k·pass@k·정밀도 임계 하향 |
| `TOLERANCE_WIDENED`              | 허용 오차·tolerance 확대       |
| `EVAL_REMOVED` / `EVAL_DISABLED` | eval task 삭제/비활성          |
| `SEVERITY_DOWNGRADED`            | red→warning, BLOCK→WARN 완화   |
| `SOT_PRECEDENCE_RELAXED`         | §5 의도>코드 우선순위 완화     |
| `AUTONOMY_EXPANDED`              | §6.1 자율 변경 범위 확대       |
| `APPROVAL_GATE_NARROWED`         | 사람 승인 경계 축소            |

- 각 weaken 레코드 = `{reason_code, diff 위치, before→after, justification(필수), approver}`, **append-only**([02 §5.5](./02-rn-migration-harness.md) 패턴).
- **재발 경보**: 같은 reason code가 sweep 가로질러 반복되면(예 `THRESHOLD_LOWERED` ×3) — 각각은 승인됐어도 **한 축으로의 체계적 침식**이라 PO 경보. 개별 승인이 누적 침식을 가리는 걸 잡는다.

---

## 7. drift 감지 (D7)

**drift 감지는 새 서브시스템이 아니라 "또 하나의 eval"** 이다. 기존 `evals/` 인프라([02 §5](./02-rn-migration-harness.md), "설치만 하고 못 쓰던 자산")를 재사용 — drift 체크 = 아티팩트 그래프 위의 결정론/모델 grader, 결과는 `runs[]` 또는 `drift-reports/`에 append.

### 시점 — 이벤트 앵커 3 + 주기 sweep

| 시점                            | 무엇                                                                 | 왜 여기                              |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| **Define-time**                 | "이 Story/AT가 아직 PRD와 맞나" (인용 resolve 검사)                  | 코드 쓰기 전 = 가장 싼 포착점, 예방  |
| **Record-time**                 | "코드가 Story 의도와 갈라졌나 / 이 변경이 다른 SoT를 stale하게 했나" | 코드 변경 직후 = 실제 drift 대부분   |
| **주기 sweep**(마일스톤/주 1회) | 4 SoT 클러스터 + **하네스 문서(00~05) ↔ 코드** 전체 정합             | 누적·"하네스 자체 노후화" 메타-drift |

### 기준 — 결정론 floor 우선

- **Tier 1 결정론(항상, 쌈)**: 깨진 내부 링크(`pnpm validate:docs`), Agent Task `Source` 인용이 사라진 PRD AC를 가리킴, 보존 eval이 red로 뒤집힘, 문서가 인용한 코드 경로 부재(hallucinated-path), AnalyticsEvent ↔ PRD §9.1 parity.
- **Tier 2 모델 보조(주기 sweep에서만)**: "PRD 의도 X에 대응하는 코드/eval이 아직 있나", "이 Story가 코드에 없는 동작을 묘사하나" → `[HUMAN REVIEW]` 플래그.
- **임계**: 모든 불일치가 report는 아님. **의도/현실 경계를 넘거나 결정론 불변식을 깬 것만** 사람 게이트 report. 단순 문서 지연은 자동 노트. (이 좁힘이 경고 피로 방어선 — 느슨하게 풀지 말 것.)

---

## 8. PM adapter (D8) + 범용화 연기 (D1)

### PM 플러그인 = optional adapter (D8)

하네스는 아티팩트의 *모양(계약)*에 의존하지, 그걸 생성한 *도구*에 의존하지 않는다.

| 층                   | 무엇                                                                                                                                                               | 성격     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **하드 의존(core)**  | 아티팩트 _계약_(PRD엔 AC, Job Story엔 situation/motivation/outcome, Test Scenario엔 steps/expected, Agent Task엔 트랙태그·수용기준·Source 인용) + 루프·게이트·eval | 불변     |
| **optional adapter** | Define-time 상류 생성기로서의 pm-execution / pm-skills-ko. 권장 기본값·교체 가능·부재 허용                                                                         | 갈아끼움 |
| **절대 금지**        | 하네스가 CI/headless에서 pm-skills를 *필수 런타임 스텝*으로 호출                                                                                                   | —        |

- pm-skills는 MCP/플러그인이라 headless·cron·CI에서 부재할 수 있다. eval 레인이 PM 플러그인에 의존하면 CI가 깨진다. 또 **포팅 트랙은 새 PRD 생성이 아예 불필요**하다(POC PRD가 이미 존재).
- 부재 시 fallback = 하네스가 스켈레톤 템플릿 제공(`pnpm new spec/adr`이 이미 하는 방식).

### 범용화 연기 (D1)

이 하네스는 **fromwith RN MVP 단일 인스턴스**용으로 짓는다. core/project-specific 분리 레이어·자동 drift 풀시스템·범용 추상은 **만들지 않는다.** 범용 템플릿화는 **두 번째 프로젝트가 실재할 때**(rule-of-three) 공통부를 추출한다. 지금 하는 일은 단 하나 — 02~05에서 _fromwith 고유값_(Kakao·`point_ledger`·도메인 모듈명)과 _구조_(루프·게이트·레이어·capability 격리)를 **글로 구분**해 추출 가능성만 보존하는 것. **왜**: 인스턴스 1개로 추상화하면 거의 항상 틀린 추상이 나온다([CLAUDE.md §2 단순함](../../CLAUDE.md)). 2주 MVP에 blocking 게이트가 걸린 상황에서 범용 메타-시스템을 동시에 짓는 건 "차를 만들며 공장도 짓는" 함정.

---

## 9. 남은 미해결 · 후속 정합 · 설계 리스크

### 9.1 남은 미해결 (하네스 _구조_ 밖 — 외부 의존)

구조는 D1~D12로 닫혔다. 남은 셋은 *값/제품 판단*이다.

1. **G1 false-flag 임계 θ** — [01 §7 Q1](./01-rn-mvp-prd.md). D12 placeholder가 기다림. P2 task `blocked` 해제 조건.
2. **G2 법무** — [01 §7 Q2](./01-rn-mvp-prd.md). boolean 게이트 flip 조건.
3. ✅ **[04 §9](./04-rn-architecture.md) PO 결정 — 2026-07-01 종료([ADR-0044](../adr/0044-rn-screen-visual-parity.md) accepted)**: Bottom Tabs 새 IA 승인 + 화면별 screenshot acceptance 채택. (invite re-tap UX는 2026-06-11 수용 확정 — 마찰은 웹 랜딩 재탭 안내 UX로 완화, [04 A7](./04-rn-architecture.md) 참조)

### 9.2 후속 정합 (02~04에 반영 필요)

이 문서가 02~04를 정련한 부분 — 해당 문서가 본 문서를 인용하도록 갱신한다(consistency debt).

| 정합 대상                             | 내용                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| [02 §4](./02-rn-migration-harness.md) | 루프 단위 "기능" = **Work Package**, 그 안의 **Agent Task(1~N)** 2-tier(D5) 명시 |
| [02 §4](./02-rn-migration-harness.md) | Extract/Port 단계의 `port`/`greenfield` 분기(D2) 명시                            |
| [02 §5](./02-rn-migration-harness.md) | drift 감지를 "또 하나의 eval"로 추가(D7), meta-eval 절(D11) 추가                 |
| 신규 `docs/eng-stories/README.md`     | Engineering Story 집·템플릿(D10) — 첫 기능 포팅 시 생성                          |

### 9.3 spec/ADR 승급 (AGENTS.md §4)

- **D11 meta-eval** → `spec` 또는 `ADR`. `evals/` 인프라에 분류기·reason-code·재발 경보를 추가하는 설계 결정이라 [AGENTS.md §4](../../AGENTS.md)의 spec-required 성격.
- **D9 두 축 개념 모델 · D12 게이트 파라미터화** → 되돌리기 비싼 구조라 ADR 후보.

### 9.4 설계 리스크 (빌드 중 감시)

- **SoT 4 클러스터 drift 부채(D3·D10의 대가).** Engineering Story가 자기 디렉토리를 가져 독립 drift. 완화=citation+D7, _제거 아님_. Story가 *동작*을 묘사하기 시작하면 즉시 코드와 경쟁 → 리뷰에서 차단(§5 규율 유지).
- **태그 오분류(D2).** port를 greenfield로 태그하면 보존 eval을 건너뛰어 회귀가 샌다. Define 태그가 단일 실패점 → PR 템플릿·eval 헤더에 강제 노출.
- **pass@3 oracle 함정(D5).** "3회 실패→분할"이 *에이전트 무능*과 *AT 과대*를 못 가른다. 분할 전 "프롬프트/컨텍스트 문제인가" 1회 점검.
- **meta-eval 우회(D11).** 누군가 하네스 변경을 *기능 변경처럼 위장*하면 meta-eval이 발화 안 함. "하네스 mechanics 파일 경로 변경"을 트리거로 못박아야(02·03·04·05·`evals/` 설정·`.claude/rules/`).
- **sweep 희생(D7·D12).** 메타-drift는 주기 sweep에만 걸린다. 일정 압박 시 sweep이 1순위 희생 대상 → 하네스가 조용히 거짓말 시작.

---

## 용어집

- **분해 spine**: PRD에서 Agent Task까지, 위 레이어를 더 구체·작은 단위로 정련하며 실행 가능한 일에 수렴하는 수직 축.
- **직교 결정 레이어**: spine과 별개로 _선택_(spec/ADR)을 기록하는 축. spine 노드가 *인용*만 하며, work로 분해되지 않는다.
- **Job Story / Engineering Story / 개발 스펙(Agent Task)**: 각각 사용자 의도 / 시스템 작업-서사 / 실행 계약. 종류·언어·청중이 다르다(§1.2).
- **Work Package(WP) / Agent Task(AT)**: WP=1 worktree=1 PR(사람·리뷰 단위), AT=에이전트 1 one-shot(WP당 1~N). 크기 oracle=pass@3.
- **port / greenfield 트랙**: 포팅(보존 baseline 있음) / 신기능(baseline 없음). Verify 게이트가 다르다(D2).
- **보존 eval(regression) / capability eval**: 포팅 후 도메인·UX 의도가 안 깨졌나(pass^k=100%) / 새 기능이 동작하나(pass@3). [02 §5](./02-rn-migration-harness.md).
- **2축 SoT 규칙**: 의도 충돌=상위 문서 우선, 현실 충돌=Agent Task eval 중재. 의도는 코드에 불양보(§5).
- **meta-eval**: 하네스 자기변경이 게이트·기준·승인 경계를 *약화*시키는지 탐지하는 단방향 반-침식 장치. 품질 판정이 아니다(§6.2).
- **weaken reason-code**: 약화 변경의 종류를 고정 enum으로 기록(감사·승인 매핑·재발 경보용).
- **rule-of-three**: 같은 패턴이 세 번 나타날 때 추상화하는 원칙. 인스턴스 1개로 범용화하지 않는 근거(D1).
- **G1 / G2**: 빌드 진입 전 BLOCKING 게이트. G1=부정탐지 false-flag 임계 PoC, G2=법무 검토. 통과 전 P1/P2 task는 `blocked`.
- **drift / drift report**: 아티팩트(PRD·Story·Agent Task·코드·하네스 문서)가 서로 어긋난 상태 / 그 어긋남을 깃발 꽂는 읽기전용 산출물.
