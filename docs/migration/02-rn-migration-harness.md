# fromwith RN MVP — Migration Harness (마이그레이션 하네스 설계)

> **Author**: pistachio8 (PO) · **Date**: 2026-06-04 · **Status**: Draft v0.1
> **Stakeholders**: FE(RN) · BE(Supabase) · QA · AI 코딩 에이전트(Claude Code · Codex · Cursor)
>
> **Pre-read** (이 문서를 읽기 전에):
>
> - [00-rn-conversion-plan](./00-rn-conversion-plan.md) — 기술 전환 분류(무엇을 재사용/재작성하나)
> - [01-rn-mvp-prd](./01-rn-mvp-prd.md) — RN MVP가 무엇을 만드나(P0 포팅 + P1 정산 + P2 자동검증)
> - [evals/README](../../evals/README.md) — 현재 eval 인프라(설치됨, 미사용)
> - [eval-harness 스킬](../../.claude/skills/eval-harness/SKILL.md) — EDD(평가 주도 개발) 프레임워크
> - [05-rn-harness-decisions](./05-rn-harness-decisions.md) — 02~04를 가로지르는 하네스 결정(D1~D12)
>
> **이 문서의 역할**: 01 PRD가 *무엇을 만드는가*라면, 이 문서는 **그걸 어떻게 안정적으로 반복 빌드·검증하는가**를 정의한다. 즉 작업 환경(격리) · 반복 루프(기능 단위) · 보존 게이트(eval) 셋을 묶은 **마이그레이션 하네스**의 설계서다. 코드 변경은 없고, 이 문서는 `docs/migration/02-rn-migration-harness.md` 신규 문서다.

---

## 0. 한 줄 요약

> 한 기능을 RN으로 옮길 때마다 **같은 절차·같은 검증**을 거치도록 강제하는 자동화 작업 환경을 만든다. 핵심 안전장치는 "PWA에서 검증된 비즈니스 로직과 UX 의도가 포팅 후에도 깨지지 않았는가"를 **eval로 회귀 검사**하는 것이다.

---

## 1. 문제 정의 — 왜 하네스가 필요한가

RN 전환은 화면 17개 + Server Action 30여 개를 **하나씩** 옮기는 반복 작업이다(00 plan §1·§9). 이 반복에는 세 가지 구조적 리스크가 있다.

1. **비즈니스 로직 드리프트**: 포팅 과정에서 도메인 규칙(벌금 누적·정산·키워드·done day 산정)이 미묘하게 달라져도 즉시 드러나지 않는다. PWA와 RN이 **같은 Supabase·같은 사용자**를 공유하므로(01 PRD §6.1), 한쪽의 계산이 틀어지면 데이터가 직접 오염된다.
2. **UX 의도 손실**: "마감 전 1회 사진 교체"(P2-1), "본인 제외 과반 반려"(P2-2), "잔액 부족 시 서약 차단"(P1-1) 같은 **의도된 제약**이 RN 재작성 중 누락되기 쉽다. 화면이 동작하는 것과 _의도대로_ 동작하는 것은 다르다.
3. **1회성 수작업 검증의 불안정**: 매 기능마다 사람이 손으로 확인하면 빠뜨림·피로·비일관이 누적된다. 에이전트에게 맡기면 빠르지만, **무엇을 통과로 볼지**가 글로 고정돼 있지 않으면 매번 결과가 흔들린다(비결정성).

> **하네스의 정의**: 위 셋을 막기 위해, 마이그레이션 한 건마다 ① 격리된 작업 공간에서 ② 정해진 단계로 옮기고 ③ 보존 eval 게이트를 통과해야만 "완료"로 인정하는 **반복 가능한 자동화 작업 환경**.

### 1.1 이미 있지만 못 쓰던 자산

레포에는 `evals/` 디렉터리와 `eval-harness` 스킬이 **이미 설치돼 있다**. 그러나 task 3건이 모두 `pending`이고 `runs[]`가 비어 있어([evals/results/agent-results.json](../../evals/results/agent-results.json)) **한 번도 실측에 쓰이지 않았다**. 이 문서의 또 다른 목표는 이 인프라에 **구체적 사용처(=마이그레이션 회귀 게이트)를 부여**해 실제로 돌아가게 하는 것이다(§5).

---

## 2. 하네스 3축 개요

| 축                            | 무엇                                                                | 이 문서 섹션 | 왜                                                         |
| ----------------------------- | ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| **A. 작업 환경(격리)**        | git worktree + 브랜치 + 에이전트 역할 + shared package 위치         | §3           | 포팅 중 코드가 main을 오염시키지 않고, 실패를 버릴 수 있게 |
| **B. 반복 마이그레이션 루프** | 한 기능을 옮기는 6단계 절차(Define→Extract→Port→Wire→Verify→Record) | §4           | 매 기능이 같은 절차를 타야 결과가 일관됨                   |
| **C. 보존 eval 게이트**       | 기존 `evals/` 를 회귀·capability 게이트로 운용                      | §5           | "완료"의 정의를 글로 고정해 비결정성 제거                  |

§6은 이 셋을 G1·G2 선행 게이트와 M1~M6 마일스톤에 **어떻게 연결**하는지, §7은 **보존 대상 매트릭스**, §8은 한 기능을 끝까지 태우는 **walkthrough**다.

---

## 3. Part A — 작업 환경 (격리)

각 마이그레이션 작업은 main을 직접 건드리지 않는 **격리된 worktree** 안에서 진행한다. 실패한 시도는 통째로 버리고 다시 시작할 수 있어야 반복이 안전하다.

### 3.1 worktree · 브랜치 전략

- **1 기능 = 1 worktree = 1 브랜치**. 브랜치명은 `feat/rn-<feature>` (예: `feat/rn-challenge-create`). PR 베이스는 `develop`(가드레일 AGENTS.md §2).
- worktree는 `.claude/worktrees/<name>` 에 둔다. 동시에 여러 기능을 병렬로 옮길 때 서로 간섭하지 않는다.
- **왜 worktree인가**: RN 포팅은 한 번에 끝나지 않고 "절반 옮기다 막히면 되돌리기"가 잦다. 브랜치 전환(`git switch`)은 작업 트리를 덮어쓰지만, worktree는 **물리적으로 분리된 디렉터리**라 진행 중인 다른 작업을 보존한다.

### 3.2 모노레포 레이아웃 (목표)

00 plan §6의 권장을 하네스 관점에서 고정한다.

```text
with-key/
├── apps/
│   ├── web/          # 현재 Next.js PWA (전환 기간 유지, cutover까지)
│   └── mobile/       # 신규 Expo RN 앱
├── packages/
│   └── domain/       # 순수 TS 도메인 (validators·keywords·challenge·bank·share)
├── supabase/         # migrations·RLS·RPC (단일 SoT, 양쪽 공유)
└── evals/            # 마이그레이션 하네스의 게이트 (이 문서 §5)
```

- **`packages/domain` 이 보존의 핵심**: PWA와 RN이 **같은 도메인 코드·같은 unit test**를 import 하면, 비즈니스 로직 드리프트(§1-①)가 구조적으로 불가능해진다. "옮긴다"가 아니라 "공유한다"가 1차 방어선이다.
- 모노레포 골격은 **전면 restructure로 선행**한다(`apps/web`+`apps/mobile`+`packages/domain`, [04 A1](./04-rn-architecture.md)). 다만 `packages/domain` **채우기는 점진적** — 빈 패키지를 먼저 만들고, 기능을 옮길 때 **그 기능이 의존하는 도메인 모듈만** 추출해 넣는다(00 plan §2 Phase 2). 즉 *구조*는 한 번에, *내용*은 기능 단위로 채운다.

### 3.3 에이전트 역할 분리

한 루프 안에서 AI 에이전트를 역할별로 나눠 호출한다. 역할이 섞이면(예: 짠 사람이 자기 코드를 검수) 회귀를 놓친다.

| 역할            | 책임                                            | 대응 도구/스킬                      |
| --------------- | ----------------------------------------------- | ----------------------------------- |
| **planner**     | 기능 1건의 마이그레이션 계획·완료조건 도출      | `everything-claude-code:planner`    |
| **porter**      | 도메인 추출 + RN UI/route 작성 + 쓰기 경로 승격 | 일반 코딩 세션                      |
| **eval-runner** | §5 보존·capability eval 실행, pass/fail 기록    | `eval-harness` 스킬                 |
| **reviewer**    | 가드레일·RLS·경계 위반 독립 검수(porter와 분리) | `code-reviewer`·`security-reviewer` |

> **왜 분리**: §1-③의 비일관을 막는 핵심은 "만든 주체와 통과를 판정하는 주체를 분리"하는 것이다. eval-runner는 글로 고정된 pass criteria만 본다(사람 정·반대 아님).

---

## 4. Part B — 기능 단위 마이그레이션 루프

한 기능(route 또는 Server Action 묶음)을 RN으로 옮기는 **반복 가능한 6단계**다. 모든 기능이 이 순서를 동일하게 탄다.

```text
[1] Define  → [2] Extract → [3] Port → [4] Wire → [5] Verify → [6] Record
  계획·완료조건   도메인 공유    RN UI/route   쓰기경로      eval 게이트    결과 append
```

| 단계           | 입력                                 | 하는 일                                                                                | 완료 조건 (다음 단계 진입 게이트)                                  |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **1. Define**  | 00 plan 라우트 행 + 01 PRD AC        | planner가 이 기능의 *보존해야 할 도메인 규칙·UX 의도*를 목록화하고 eval task 초안 작성 | 보존 항목과 capability 항목이 글로 적혔다(=§5 task 파일 초안)      |
| **2. Extract** | 그 기능이 쓰는 `src/lib/*` 순수 모듈 | 도메인 모듈을 `packages/domain` 으로 이동, **기존 unit test를 그대로 동반**            | web·RN 양쪽 `pnpm typecheck` + 도메인 unit test 통과               |
| **3. Port**    | 00 plan §4 UI/route 매핑             | Expo Router screen·컴포넌트 작성. 브라우저 전용(canvas·IDB·SW)은 native API로 교체     | RN 화면이 빌드되고 mock/실데이터로 렌더                            |
| **4. Wire**    | 00 plan §9 Server Action 승격표      | Server Action → Supabase RPC 직접 호출 또는 BFF API. service-role·암호화는 서버 격리   | 쓰기 1건이 RLS 사용자로 성공, RLS 우회 없음(reviewer 확인)         |
| **5. Verify**  | §1 단계의 eval task                  | eval-runner가 보존 eval(regression) + capability eval 실행                             | **보존 eval pass^k=100%**, capability eval **pass@3 ≥ 목표**(§5.3) |
| **6. Record**  | eval 실행 결과                       | `evals/results/agent-results.json` `runs[]` 에 append, 회귀 발생 시 ADR 1건            | 결과가 append-only로 남고, 기능 PR이 `develop` 로 열림             |

- **루프 불변식**: 5단계 보존 eval을 통과하지 못하면 **그 기능은 "옮겨지지 않은 것"**으로 본다. 화면이 떠도 마찬가지다. 이것이 §1-①②를 막는 강제력이다.
- **되돌리기**: 어느 단계든 막히면 worktree를 버리고(§3.1) 1단계로 복귀. 부분 포팅을 main에 남기지 않는다.
- **레이어 규칙 참조**: 3·4단계(Port·Wire)에서 각 레이어를 어떤 라이브러리·패턴으로 옮길지는 [03-rn-migration-rules](./03-rn-migration-rules.md)를 따른다(레이어별 매핑·판단 기준). 권장 스택의 확정/권장(결정 필요) 구분은 그 문서 §0.3.

---

## 5. Part C — 보존 eval 게이트 (핵심)

> 이 섹션이 "설치만 하고 못 쓰던 `evals/`"에 실제 사용처를 부여하는 부분이다.

### 5.1 두 종류의 eval

기존 `eval-harness` 스킬은 eval을 **capability**(전엔 못 하던 걸 하나)와 **regression**(있던 게 안 깨졌나)으로 나눈다([SKILL.md](../../.claude/skills/eval-harness/SKILL.md)). 마이그레이션 하네스는 이 둘을 **각각 다른 목적**에 쓴다.

| eval 종류                     | 무엇을 재나                                                   | 채점자(grader)     | 통과 기준         |
| ----------------------------- | ------------------------------------------------------------- | ------------------ | ----------------- |
| **① 보존 eval (regression)**  | PWA 도메인 규칙·UX 의도가 RN 포팅 후에도 동일한가             | 결정론(코드) 우선  | **pass^k = 100%** |
| **② 마이그레이션 capability** | "이 기능을 RN으로 옮겨라" task를 에이전트가 1-shot으로 해내나 | 결정론 + 모델 보조 | **pass@3 ≥ 목표** |

- **①이 진짜 안전장치다.** ②는 하네스(에이전트 자동화)의 신뢰성을 재는 것이고, ①은 *제품*이 안 깨졌는지를 잰다. 둘 다 같은 `evals/` 인프라에 쌓는다.
- 기존 task 0001~0003(Server Action·AI fallback·RLS)은 ②의 선례 형식이다(2026-06-11 `evals/tasks/archive/`로 보관 — PWA baseline 미실행, RN 전환으로 효용 소멸). 마이그레이션 task는 `0004-` 부터 append(스펙 수정 금지, README "Gotcha"). `0004`는 Phase 0 인벤토리 freeze이고(route/action/read 매트릭스를 [00 plan §13](./00-rn-conversion-plan.md)에 고정), 기능 포팅 task(`0005+`)는 그 §13을 Parent 인벤토리로 인용한다.

### 5.2 보존 eval을 어떤 채점자로 거나

도메인마다 검증 비용이 다르므로 채점자를 매핑한다(SKILL.md "채점자 유형").

| 보존 대상                                   | 채점자                  | 구체 방법                                                                                  |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| 순수 도메인(벌금 누적·정산·done day·키워드) | **결정론(코드)**        | `packages/domain` 의 **기존 unit test를 web·RN 양쪽에서 실행** → 동일 입력 동일 출력       |
| read 계약(피드·대시보드·recap view model)   | **결정론(스냅샷)**      | 동일 fixture로 PWA read 함수와 RN-safe read 함수 결과를 **JSON 스냅샷 비교**(00 plan §3.2) |
| UX 의도(서약 차단·1회 교체·과반 반려)       | **모델 + 사람**         | acceptance 시나리오를 모델 grader로 1차, 경계 케이스는 `[HUMAN REVIEW REQUIRED]` 플래그    |
| RLS 경계(클라 write 차단·service-role 격리) | **결정론(역할별 실측)** | anon·authenticated 역할로 직접 read/write 시도 → 차단 확인(QUALITY_GATE 추가 검증)         |

> **왜 도메인은 결정론 우선**: 정산·벌금은 금전성이라(01 PRD §6.2 `point_ledger`) 모델 채점의 모호함을 허용할 수 없다. "같은 코드를 공유"(§3.2)하면 이 eval은 사실상 "양쪽에서 같은 test가 돈다"로 환원된다.

### 5.3 pass@k / pass^k 기준

| 게이트              | 지표       | 기준           | 왜                                                |
| ------------------- | ---------- | -------------- | ------------------------------------------------- |
| 보존 eval(①)        | **pass^k** | k=3, **100%**  | 회귀는 한 번이라도 깨지면 데이터 오염, 무관용     |
| 마이그레이션 cap(②) | **pass@k** | k=3, **≥ 90%** | 하네스가 3회 내 1회는 자동 성공해야 반복이 실용적 |
| 신기능 P1/P2 정확도 | 별도(G1)   | §6 게이트      | 제품 정확도는 사진셋·법무 PoC로 따로 검증         |

### 5.4 마이그레이션 eval task 템플릿

기존 [0001 task](../../evals/tasks/archive/0001-server-action-create-kudos.md) 형식을 마이그레이션용으로 확장한다. `evals/tasks/000N-rn-<feature>.md` 형태로 추가한다(기능 포팅은 `0005-`부터; `0004`는 인벤토리 freeze).

```markdown
# EVAL-000N: RN 포팅 — <feature> (예: 챌린지 생성)

**Status**: pending baseline
**Tier**: migration (PWA→RN 기능 단위)
**Source feature**: 00-rn-conversion-plan §1 <route>, 01-rn-mvp-prd <AC>

## Prompt (agent에 그대로 입력)

> `<route>` 기능을 Expo RN 화면으로 옮기세요. 도메인 로직은 packages/domain 에서
> import 하고(직접 재정의 금지), 쓰기 경로는 <RPC/BFF>로 호출하세요. <UX 의도 목록>을
> 모두 유지해야 합니다.

## 보존 criteria (regression — pass^3=100%)

| 보존 항목            | 검증 방법(채점자)                            |
| -------------------- | -------------------------------------------- |
| 도메인 규칙 동일     | packages/domain unit test 양쪽 통과 (결정론) |
| read view model 동일 | fixture 스냅샷 일치 (결정론)                 |
| UX 의도 <항목>       | acceptance 시나리오 (모델/사람)              |
| RLS 경계             | anon/authenticated 역할 실측 (결정론)        |

## capability criteria (pass@3 ≥ 90%)

| 기준                | 검증 방법                                  |
| ------------------- | ------------------------------------------ |
| RN 화면 빌드·렌더   | `pnpm --filter mobile build`               |
| 쓰기 1건 성공       | RPC/BFF 호출 후 DB 상태 확인               |
| typecheck·lint·test | `pnpm typecheck && pnpm lint && pnpm test` |

## One-shot 정의

위 prompt 한 번 입력 후 추가 지시 없이 보존+capability 전부 통과 → one_shot=true.
```

### 5.5 결과 운용 (append-only)

- 실행 결과는 `evals/results/agent-results.json` 의 `runs[]` 에만 append. 기존 항목·task 스펙은 **수정 금지**(비교 가능성, README "Gotcha").
- 한 run 레코드(권장 필드): `task_id` · `model` · `timestamp`(ISO8601) · `one_shot`(bool) · `regression_pass`(bool) · `capability_pass`(bool) · `notes`.
- 보존 eval이 깨지면(regression_pass=false) → 원인 결정은 `docs/adr/` 에 ADR 1건(README "See also").

---

## 6. Part D — 선행 게이트·마일스톤 통합

하네스는 진공이 아니라 01 PRD의 게이트 구조 위에서 돈다.

### 6.1 선행 게이트 (BLOCKING)

| 게이트 | 무엇                           | 하네스와의 관계                                                                 |
| ------ | ------------------------------ | ------------------------------------------------------------------------------- |
| **G1** | 부정탐지 false-flag 정밀도 PoC | §5 capability/보존과 **별개**. 실사진셋 평가라 evals/ 에 별도 tier로 둘 수 있음 |
| **G2** | 법무 검토(적립/번들 포인트)    | 코드 게이트 아님. 통과 전 P1 정산 루프 task는 `blocked` 로 둔다                 |

- G1·G2가 통과하기 전에는 P1·P2 관련 마이그레이션 task를 §4 루프에 올리지 않는다(01 PRD §0).

### 6.2 마일스톤 게이트 (M1~M6)

01 PRD §8의 M1~M6 각 완료 조건을 **그 마일스톤에 속한 기능들의 §4 루프 5단계(Verify) 통과 합**으로 정의한다.

| 마일스톤 | 묶음                          | 마일스톤 통과 = ?                                            |
| -------- | ----------------------------- | ------------------------------------------------------------ |
| M1       | 포팅 기반(인증·딥링크·domain) | shared domain 보존 eval 100% + auth capability pass@3        |
| M2       | read 패리티                   | 핵심 read view model 스냅샷 eval 전부 통과                   |
| M3       | mutation + P2 자동검증        | 쓰기 RLS 경계 eval + P2 부정탐지 결정론 신호 eval            |
| M4       | P1 정산                       | `point_ledger` 정합성(이중정산 없음·잔액=Σdelta) 결정론 eval |
| M5       | 알림·polish                   | 푸시·공유 failure path 시나리오 eval                         |
| M6       | dogfood/cutover               | end-to-end 시나리오 + PWA fallback 보존 eval                 |

---

## 7. 보존 대상 매트릭스 (eval task 후보)

00 plan §3 "재사용 가능" 목록을 **보존 eval task 후보**로 직접 매핑한다. 이 표가 §5.4 task 파일들의 작성 백로그다.

| 보존 대상(`src/lib/*`)                | 보존되는 비즈니스 규칙                          | eval 채점자        | 우선순위 |
| ------------------------------------- | ----------------------------------------------- | ------------------ | -------- |
| `challenge/*`                         | done day·duration·frequency·penalty·streak·정산 | 결정론(unit test)  | **P0**   |
| `validators/*`                        | 챌린지·action·group·kudos 입력 계약(zod SoT)    | 결정론(unit test)  | **P0**   |
| `keywords/pool·shuffle`               | 키워드 풀 freeze·reroll limit                   | 결정론(unit test)  | P1       |
| `share/period·seed·pick`              | recap 공유 기간·seed 재현성                     | 결정론(unit test)  | P1       |
| `db/reads/*`                          | read view model shape                           | 결정론(스냅샷)     | **P0**   |
| `bank/*`·`groups/default-name`        | 은행코드·자동 그룹명                            | 결정론(unit test)  | P2       |
| 신규 `point_ledger`·`settlements`     | 정산 정합성(P1, 금전성)                         | 결정론(불변식)     | **P0**   |
| P2 부정탐지 신호(phash·EXIF·스크린샷) | 결정론 부정탐지 판정                            | 결정론 + G1 사진셋 | **P0**   |

---

## 8. Walkthrough — "챌린지 생성" 한 건을 루프에 태우기

하네스가 실제로 어떻게 도는지 한 기능으로 예시한다(개념 예시, 실제 구현 아님).

1. **Define**: planner가 `/challenge/new`(00 plan §1) + `createChallenge`(§9)를 본다. 보존 항목 = `create_challenge` RPC 트랜잭션·기본 그룹명·penalty 범위 검증. UX 의도 = owner group 가드. → `evals/tasks/000N-rn-challenge-create.md` 초안.
2. **Extract**: `validators/challenge.ts`·`challenge/penalty.ts`·`groups/default-name.ts` 를 `packages/domain` 으로 이동, 기존 test 동반. web·RN typecheck 통과.
3. **Port**: Expo Router `/(flow)/challenge/new` screen 작성. shadcn form → RN 입력 컴포넌트.
4. **Wire**: `createChallenge` Server Action → `create_challenge` RPC 직접 호출 + invite 생성. service-role 없는지 reviewer 확인.
5. **Verify**: eval-runner가 보존 eval(domain test 양쪽 통과 + 입력 계약 스냅샷, pass^3=100%) + capability(RN에서 챌린지 1건 생성 후 PWA 피드에도 표시, pass@3≥90%) 실행.
6. **Record**: 결과 `runs[]` append. PR `feat/rn-challenge-create` → `develop`.

> 막히면(예: RPC가 service-role을 숨겨 호출) worktree 버리고 1단계로. 보존 eval이 빨개지면 그 기능은 미완료.

---

## 9. 다음 단계 (이 문서 이후)

1. `packages/domain` 추출 PoC 1건(예: `challenge/penalty.ts`) — web·RN 양쪽 import + test 동반(§3.2 검증).
2. Phase 0 인벤토리 freeze는 `evals/tasks/0004-rn-phase0-inventory-freeze.md`로 완료(매트릭스는 [00 plan §13](./00-rn-conversion-plan.md)). 첫 기능 포팅 task(`evals/tasks/000N-rn-<feature>.md`)를 §5.4 템플릿으로 작성하고 §13을 Parent로 인용해 실측한다(§1.1 "못 쓰던 인프라" 첫 가동).
3. 보존 eval P0 후보(§7) 중 `challenge/*`·`db/reads/*`·정산 정합성 task 우선 작성.
4. G1(부정탐지 정밀도)·G2(법무) 게이트 일정 확정 — P1/P2 task `blocked` 해제 조건.
5. run 레코드 필드(§5.5)를 `agent-results.json` schema에 반영(append-only 유지).

---

## 용어집

- **마이그레이션 하네스**: 기능 1건을 RN으로 옮길 때마다 같은 격리·절차·검증을 강제하는 자동화 작업 환경. 3축 = 작업환경(§3)·반복 루프(§4)·보존 게이트(§5).
- **보존 eval (regression)**: PWA에서 검증된 도메인 규칙·UX 의도가 RN 포팅 후에도 깨지지 않았는지 회귀 검사하는 평가. 무관용(pass^k=100%).
- **마이그레이션 capability eval**: "이 기능을 RN으로 옮겨라" task를 에이전트가 1-shot으로 해내는지 재는 평가. 하네스 자동화의 신뢰성 측정(pass@3≥90%).
- **EDD(평가 주도 개발, Eval-Driven Development)**: 구현 전에 합격/불합격 기준(eval)을 먼저 정의하고, 개발 중 지속 실행해 회귀를 조기 포착하는 방법론. eval-harness 스킬의 철학.
- **pass@k / pass^k**: k번 시도 중 1번 이상 성공 / k번 모두 성공. 신뢰성이 중요한 보존 게이트는 pass^k.
- **채점자(grader)**: 결정론(코드 grep·test)·모델(Claude 평가)·사람(수동 플래그) 세 종류. 도메인·금전성은 결정론 우선.
- **packages/domain**: PWA와 RN이 공유하는 순수 TS 도메인 패키지. "옮긴다"가 아니라 "공유한다"가 비즈니스 로직 보존의 1차 방어선.
- **worktree**: 같은 저장소의 물리적으로 분리된 작업 디렉터리. 진행 중 작업을 보존하며 격리 실험·되돌리기를 가능하게 함.
- **RPC / BFF**: Supabase Postgres 함수 호출 / Backend-for-Frontend API. RN은 Server Action을 못 써서 쓰기 경로를 이리로 승격.
- **G1 / G2**: RN MVP 빌드 진입 전 통과해야 하는 선행 게이트. G1=부정탐지 정밀도 PoC, G2=법무 검토. 통과 전 P1/P2 task는 blocked.
- **append-only**: 기존 항목을 수정·삭제하지 않고 끝에만 추가하는 기록 방식. eval 결과는 시점 비교 가능성을 위해 append-only.
