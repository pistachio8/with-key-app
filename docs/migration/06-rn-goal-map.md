# PWA→RN 전환 Goal Map (`/goal` 실행용)

> 이 문서는 [`00-rn-conversion-plan.md`](./00-rn-conversion-plan.md) §8 "첫 10개 goal"을 **순서·의존성·복붙용 `/goal` 조건**이 박힌 실행 맵으로 푼 것이다. Claude Code 내장 `/goal`(v2.1.139+, Research Preview)에 골 하나씩 먹여 순서대로 돌리는 게 목적이다.

**범위**: Phase 0~5 (G1~G10). Phase 6~8(Notifications·Recap/Share·Cutover)과 01-PRD의 P1/P2 greenfield 트랙은 §5에서 범위 밖으로 명시한다.

**상태(Status)는 여기 적지 않는다.** 추적 매트릭스(골별 todo/done)는 `harness:report`의 **생성 출력**이지 체크인 SoT가 아니다 ([`.agents/backlog/TRACEABILITY.md`](../../.agents/backlog/TRACEABILITY.md), ADR-0031 §6). 여기 중복하면 또 하나의 drift 표면이 된다. 이 맵은 **골 정의·순서·의존·`/goal` 조건**(결정 SoT)만 담는다.

> ⚠️ **번호 충돌 주의**: 이 맵의 `G1~G10`은 `00 §8` goal 번호다. [`01-rn-mvp-prd.md`](./01-rn-mvp-prd.md) §0의 BLOCKING 게이트 `G1`(부정탐지 정밀도 PoC)·`G2`(법무 검토)와는 **다른 축**이다. 혼동을 줄이려 이 문서는 골을 항상 "`G1` (§8 #1)"처럼 §8 번호를 병기한다.

## 0. `/goal` 사용법 (먼저 읽기)

`/goal`은 평문 조건 1개를 받아 충족될 때까지 턴을 자동 반복하는 내장 커맨드다. 맵을 돌리기 전에 그 제약을 알아야 조건이 헛돌지 않는다.

- **입력 = 단일 평문 조건 1개** (≤4000자). 골 id·파일·리스트를 먹지 않는다. 그래서 골마다 §3에 **복붙용 조건 문자열**을 미리 합성해 둔다.
- **평가자 = 빠른 모델(Haiku)이 transcript만 보고 yes/no 판정.** 파일을 직접 읽거나 도구를 호출하지 않는다. 따라서 조건은 _"Claude가 대화에 증거(테스트 출력·`git status`·파일 목록)를 띄우도록"_ 작성한다 — §3 조건의 "증명:" 절이 그 역할이다.
- **native 체이닝 없음.** 골 하나가 achieved되면 `/goal clear` 후 다음 골 조건을 다시 `/goal`로 붙인다 (수동 게이트). session-scoped — 별도 goal 파일/로그 없음.
- **bound 필수.** 무한 루프 방지로 모든 조건 끝에 "N턴 내 못 끝내면 멈춘다"를 둔다. 턴 예산 안에 green 못 만들면 골이 과대 → [`split-work-packages`](../../.agents/workflows/split-work-packages.md)로 분해.

**실행 루프 (수동):**

```
1. §1 DAG에서 의존성 충족된 골 1개 고른다 (G1부터).
2. §3의 해당 골 "/goal 조건"을 복사해 `/goal <조건>` 으로 붙인다.
3. achieved 뜨면 → `/goal clear`.
4. 골이 큰 경우(분해 표시) 끝나기 전에 evals/tasks/ Agent Task로 쪼갠다.
5. 다음 의존성 충족 골로 이동, 2로.
```

> 10골을 사람이 안 넘기고 한 번에 자동으로 돌리려면 `/goal`이 아니라 **Workflow 스크립트**가 문서상 유일한 경로다. POC 단계에선 골 사이 사람 게이트(검토·커밋)가 안전하므로 **수동 체이닝을 기본**으로 한다.

## 1. 의존성 그래프 (실행 순서)

`G2`(아키텍처 결정 ADR)가 대부분의 게이트다. 결정이 안 서면 그 위 골들이 재작업된다.

```
G1 ─▶ G2 ─┬─▶ G3 ─┬─▶ G4
          │       └─▶ G5 ─┐
          └─▶ G6 ─▶ G7 ───┴─▶ G8 ─▶ G9 ─▶ G10
```

- 직렬 임계경로: `G1 → G2 → G3 → G5 → G8 → G9 → G10`
- 병렬 가능: `G4`(딥링크 PoC)는 `G3` 후 `G5`와 무관하게, `G6`(shared domain)는 `G2` 후 `G3`와 무관하게 진행 가능.

## 2. Goal Map

| 골      | 한 줄 결과                        | depends-on | 출처 (00)                                | Phase (00 §7) | 대응 `evals/tasks`                          |
| ------- | --------------------------------- | ---------- | ---------------------------------------- | ------------- | ------------------------------------------- |
| **G1**  | Route/action/read 인벤토리 freeze | —          | §1·§8 #1·§9                              | Phase 0       | `0004-rn-phase0-inventory-freeze.md` (존재) |
| **G2**  | RN target 아키텍처 결정 (ADR)     | G1         | §8 #2·§5(2)                              | Phase 0       | 생성 필요 (ADR)                             |
| **G3**  | Supabase RN auth PoC              | G2         | §8 #3·§5(3)                              | Phase 1       | 생성 필요                                   |
| **G4**  | Invite deep link PoC              | G3         | §8 #4 ([04](./04-rn-architecture.md) A7) | Phase 1       | 생성 필요                                   |
| **G5**  | Expo Router route skeleton        | G2·G3      | §8 #5·§10                                | Phase 1       | 생성 필요                                   |
| **G6**  | Shared domain package build       | G2         | §8 #6·§3.1                               | Phase 2       | 분해 필요(다수)                             |
| **G7**  | Read model contract 정의          | G6         | §8 #7·§3.2                               | Phase 3       | 생성 필요                                   |
| **G8**  | Home + challenge read-only 화면   | G5·G7      | §8 #8                                    | Phase 3       | 분해 필요                                   |
| **G9**  | Challenge lifecycle mutations     | G8         | §8 #9·§9                                 | Phase 4       | 분해 필요                                   |
| **G10** | Native action log MVP             | G9         | §8 #10·§5(10)                            | Phase 5       | 분해 필요                                   |

"생성 필요" = 골이 `/goal` 1회·턴 예산 안에 안 닫히면 [`create-agent-tasks`](../../.agents/workflows/create-agent-tasks.md)로 `evals/tasks/0010~`을 만든다. "분해 필요" = 골이 크므로 시작 시 분해를 권장한다.

## 3. 골별 `/goal` 조건 (복붙용)

각 조건은 `측정가능 end state + 증명: <Claude가 출력할 커맨드> + scope seal + turn bound` 구조다. 그대로 복사해 `/goal <조건>` 으로 쓴다. 경로 중 `apps/mobile`·`packages/domain`은 아직 없는 forward-looking 경로 — 해당 골이 만든다.

### G1 — Route/action/read 인벤토리 freeze (§8 #1, Phase 0)

- 완료조건(00 §8): 라우트 표에 각 route의 RN 처리 방식이 있고, 모든 `_actions.ts` export가 RPC/API/폐기 중 하나로 분류된 보조 matrix가 작성됨.
- 이미 `evals/tasks/0004-rn-phase0-inventory-freeze.md`로 seeded — 그 5개 AC를 우선한다.
- ⚠️ `pnpm harness:check`는 현재 skeleton이라 인벤토리가 비어도 통과한다(약한 게이트). 그래서 조건은 **action matrix 자체**(export 수 = 분류 row 수)를 증거로 잡는다.

```
/goal evals/tasks/0004 의 5개 Acceptance Criteria가 모두 충족됐다: (1) src/app/**/page.tsx 의 모든 user-facing route가 docs/migration/00 §1 표에 "RN 전환 분류"와 함께 있고 누락 0건 (2) src/app/**/_actions.ts 의 모든 export가 RPC direct|BFF API|RN direct|deprecated 4분류 matrix에 분류됨 (3) 핵심 read 함수가 service-role/cache/cookie 의존 플래그와 함께 분류됨 (4) Phase 1 전 필요한 ADR/spec(decision debt) 목록이 명시됨 (5) pnpm harness:check 통과. 증명: route 누락 diff, _actions export 수 vs matrix row 수 일치, read matrix, decision debt 목록, harness:check 출력을 모두 transcript에 띄운다. src/ 코드와 supabase/migrations 는 수정하지 않는다(문서·evals만). 15턴 내 못 끝내면 멈춘다.
```

### G2 — RN target 아키텍처 결정 (§8 #2, Phase 0)

- 완료조건(00 §8): `apps/mobile`/별도 repo, shared package 위치, PWA 유지 범위, BFF 유지 범위가 ADR 또는 spec으로 결정됨.
- 테스트가 아니라 **결정 문서 존재**가 게이트다.

```
/goal docs/adr/ 에 RN target 아키텍처를 결정한 새 ADR 파일이 존재하고, 그 본문이 (1) Expo 앱 위치(apps/mobile vs 별도 repo) (2) shared TS package 위치(packages/domain) (3) PWA 유지 범위 (4) BFF 유지 범위 — 4개 결정을 모두 명시한다. 증명: 해당 ADR 파일 경로와 4개 결정 섹션 헤딩을 출력하고 `pnpm validate:docs` 가 exit 0. supabase/migrations 와 src/lib/supabase 는 건드리지 않는다. 12턴 내 못 끝내면 멈춘다.
```

### G3 — Supabase RN auth PoC (§8 #3, Phase 1)

- 완료조건(00 §8·§7 Phase 1): dev build에서 Kakao OAuth 또는 magic link 로그인, 앱 재시작 후 session restore, logout 성공.
- 실기기/dev build 수동 확인이 섞이므로 조건에 "수동 확인 로그를 붙인다"를 둔다.

```
/goal Expo dev build에서 (1) Kakao OAuth 또는 magic link 로그인 성공 (2) 앱 재시작 후 persisted session restore 성공 (3) logout 성공 — 3개가 동작하는 RN auth 코드가 apps/mobile 에 존재한다. 증명: 관련 RN 파일 목록과 auth 관련 unit/통합 test 출력(`pnpm test -- auth`)을 띄우고, dev build 3개 시나리오 수동 확인 결과를 체크리스트로 남긴다. @supabase/ssr cookie flow 는 RN에서 재사용하지 않는다. 25턴 내 못 끝내면 멈춘다.
```

### G4 — Invite deep link PoC (§8 #4, Phase 1)

- 완료조건(00 §8, 04 A7): 설치 시 universal/app link 또는 `fromwith://invite/<token>`로 앱이 열리고, 미인증이면 token stash→로그인 후 자동 수락 복귀. 미설치는 웹 랜딩→스토어→재탭 수락(deferred 아님).

```
/goal 설치된 앱에서 universal/app link 또는 fromwith://invite/<token> 으로 앱이 열리고, 미인증이면 token을 stash해 로그인 후 같은 token으로 accept_invite 까지 자동 복귀하는 RN deep link 핸들러가 존재한다. 증명: deep link 핸들러 파일과 token stash/복귀 로직의 test 출력(`pnpm test -- invite`)을 띄우고, 설치/미설치 2개 경로 수동 확인을 체크리스트로 남긴다. accept_invite RPC 계약은 바꾸지 않는다. 20턴 내 못 끝내면 멈춘다.
```

### G5 — Expo Router route skeleton (§8 #5, Phase 1)

- 완료조건(00 §8·§10): `/login`·`/invite/[token]`·`/home`·`/challenge/[id]`·`/challenge/[id]/action`·`/challenge/[id]/pledge`·`/challenge/[id]/recap`·`/me`에 해당하는 RN route가 존재하고 auth gate가 동작.

```
/goal apps/mobile 에 Expo Router route 트리가 있어 /login, /invite/[token], /home, /challenge/[id], /challenge/[id]/action, /challenge/[id]/pledge, /challenge/[id]/recap, /me 8개 route가 모두 존재하고 미인증 시 보호 route가 /login 으로 redirect되는 auth gate가 동작한다. 증명: route 파일 목록과 `pnpm typecheck` exit 0, auth gate test 출력을 띄운다. 화면 내부 비즈니스 로직은 placeholder로 두고(이 골은 skeleton만), 다른 골 범위를 구현하지 않는다. 20턴 내 못 끝내면 멈춘다.
```

### G6 — Shared domain package build (§8 #6, Phase 2) — **분해 권장**

- 완료조건(00 §8·§3.1): validators/keywords/challenge/bank/share 순수 모듈이 RN·Next 양쪽에서 import되고 동일 unit test가 양쪽에서 통과.
- 5개 도메인이라 골이 크다 — `validators → keywords → challenge → bank → share` 순으로 Agent Task 분해 권장.

```
/goal validators, keywords, challenge, bank, share 순수 도메인 모듈이 packages/domain shared package로 이동했고, RN(apps/mobile)과 Next(src) 양쪽에서 import되며 동일 unit test가 양쪽에서 통과한다. 증명: 양쪽에서 `pnpm test -- <domain>` 출력과 `pnpm typecheck` exit 0, 그리고 `rg "next/|server-only|use server" packages/domain` 결과가 비어 있음(서버 전용 import 0건)을 띄운다. src/lib/keywords/pool.ts 의 KEYWORD_POOL_VERSION 은 변경하지 않는다(freeze). 다른 트랙 파일은 건드리지 않는다. 30턴 내 못 끝내면 split-work-packages로 분해하고 멈춘다.
```

### G7 — Read model contract 정의 (§8 #7, Phase 3)

- 완료조건(00 §8·§3.2): Home/challenge/group/recap/me read contract가 RN-safe 함수 또는 API로 정의되고 service-role/cache 의존 여부가 명시됨.

```
/goal fetchCurrentChallenges, fetchChallengeDetail, fetchChallengeFeed, fetchRecap, fetchGroupDetail, fetchMyChallenges 의 RN-safe read contract(next/cache·cookies·admin hydrate 의존 제거)가 함수 시그니처 또는 API 스펙으로 정의돼 있고, 각 contract의 service-role/cache 의존 여부가 문서에 명시돼 있다. 증명: contract 정의 파일/스펙 경로와 `pnpm typecheck` exit 0를 띄우고, ADR-0024 admin hydrate 의존이 제거(BFF로 격리)됐음을 grep으로 보인다. RLS 우회(service-role를 client에 노출) 0건. 22턴 내 못 끝내면 멈춘다.
```

### G8 — Home + challenge read-only 화면 (§8 #8, Phase 3) — **분해 권장**

- 완료조건(00 §8): RN에서 로그인 사용자 기준 홈, 챌린지 feed/dashboard/info가 실 Supabase 데이터로 렌더됨.

```
/goal RN(apps/mobile)에서 RLS 사용자로 로그인하면 홈, 챌린지 feed/dashboard/info 화면이 G7 read contract를 통해 실 Supabase 데이터로 렌더된다. 증명: 화면 컴포넌트 파일 목록과 read 호출 test 출력, `pnpm typecheck` exit 0를 띄우고, 실 데이터 렌더를 dev build에서 수동 확인 체크리스트로 남긴다. 쓰기(mutation) 경로는 이 골에서 구현하지 않는다(read-only). RLS 직접 접근만 사용한다. 28턴 내 못 끝내면 분해하고 멈춘다.
```

### G9 — Challenge lifecycle mutations (§8 #9, Phase 4) — **분해 권장**

- 완료조건(00 §8·§9): RN에서 create challenge, invite accept, pledge sign, signed participants start가 성공하고 기존 PWA에서도 같은 DB 상태를 정상 표시.

```
/goal RN(apps/mobile)에서 create challenge, accept invite, sign pledge, start with signed participants 4개 mutation이 RPC 또는 BFF 계약으로 성공하고, 같은 DB 상태를 기존 PWA에서도 정상 표시한다(이중 운영 호환). 증명: 각 mutation의 호출 코드와 test 출력(`pnpm test -- mutation`), `pnpm typecheck` exit 0를 띄우고, Server Action이 숨긴 service-role 작업이 client에 노출되지 않음(RLS 우회 0건)을 grep으로 보인다. supabase/migrations 는 append-only 규칙을 지킨다. 30턴 내 못 끝내면 분해하고 멈춘다.
```

### G10 — Native action log MVP (§8 #10, Phase 5) — **분해 권장**

- 완료조건(00 §8·§7 Phase 5): RN에서 사진 선택/압축/업로드/AI 일기 생성/`action_logs` insert/feed 반영까지 한 번에 성공. AI fallback 포함.

```
/goal RN(apps/mobile)에서 사진 선택→압축(1920px·5MB·JPEG)→Storage 업로드→서버 API로 AI 일기 생성(fallback 포함)→action_logs insert→feed 반영까지 1건이 끝까지 성공한다. 증명: ImagePicker/ImageManipulator 업로드 파이프라인 코드와 submitActionLog API 호출 test 출력, action_logged/ai_generated 이벤트 발생 로그(본문 미로깅·메타만)를 띄우고, 실기기에서 사진 인증 1건 성공을 수동 확인으로 남긴다. OpenAI key는 서버 전용 유지(client 노출 0건). 30턴 내 못 끝내면 분해하고 멈춘다.
```

## 4. 골 → Agent Task 분해 (막힐 때만)

골이 `/goal` 턴 예산 안에 안 닫히면(특히 G6·G8·G9·G10), [`create-agent-tasks`](../../.agents/workflows/create-agent-tasks.md)로 `evals/tasks/0010~`을 만든다. Agent Task의 `Acceptance Criteria` + `Verification Commands`가 곧 다음 `/goal` 조건의 재료다 — 조건은 §3 구조(end state + 증명 + scope seal + bound)로 합성한다. Agent Task frontmatter `Status`·`Blocked-by`가 순서 게이트를 인코딩한다([`AGENT_TASK_TEMPLATE.md`](../../.agents/backlog/AGENT_TASK_TEMPLATE.md)).

## 5. 범위 밖 (이 맵이 다루지 않음)

- **Phase 6~8** (Notifications · Recap/Share & Polish · Cutover): 완료조건이 00 §7 수준이라 골 단위로 풀려면 추가 정의가 필요하다. Phase 0~5 도달 후 이 문서에 `G11~`로 확장한다.
- **01-PRD P1/P2 greenfield 트랙** (포인트 정산 §5.C · 사진 자동검증 §5.B): §8 포팅 스캐폴딩과 다른 축이고, 01-PRD §0의 BLOCKING 게이트(부정탐지 PoC·법무)에 막혀 있다. 별도 spine(`docs/pm/` · `docs/eng-stories/`)으로 추적한다.

## 용어집

- **`/goal`**: Claude Code 내장 슬래시 커맨드(v2.1.139+). 평문 조건 1개를 받아 충족될 때까지 턴 자동 반복. 빠른 모델이 transcript만 보고 판정.
- **DAG**: Directed Acyclic Graph — 방향성 비순환 그래프. 여기선 골 간 선행 의존을 표현.
- **BFF**: Backend for Frontend — 클라이언트 전용 백엔드 계약 계층(여기선 RN이 호출할 API 경계).
- **PoC**: Proof of Concept — 개념 증명(동작 가능성만 확인하는 최소 구현).
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(Supabase 강제).
- **shared domain package**: RN과 Next가 함께 import하는 순수 TS 모듈 묶음(`packages/domain`).
- **scope seal**: `/goal` 조건에서 "건드리지 않을 범위"를 못박는 절 — 원칙 6(외과적 수정) 강제.
- **turn bound**: `/goal` 무한 루프 방지용 "N턴 내 미완 시 멈춤" 절.
