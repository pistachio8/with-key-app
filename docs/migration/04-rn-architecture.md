# fromwith RN MVP — Architecture (신규 RN 프로젝트 아키텍처)

> **Author**: pistachio8 (PO) · **Date**: 2026-06-04 · **Status**: Draft v0.1
> **Stakeholders**: FE(RN) · BE(Supabase) · QA · AI 코딩 에이전트(Claude Code · Codex · Cursor)
>
> **Pre-read** (이 문서를 읽기 전에):
>
> - [03-rn-migration-rules](./03-rn-migration-rules.md) — 레이어별 전환 규칙 + 권장 스택·결정 상태(이 문서가 그 "권장"을 구체 결정으로 확정)
> - [00-rn-conversion-plan](./00-rn-conversion-plan.md) — 라우트·Server Action 인벤토리(§9 승격 매트릭스, §10 route map)
> - [01-rn-mvp-prd](./01-rn-mvp-prd.md) — RN MVP 범위(P0 포팅 + P1 정산 + P2 자동검증)
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 반복 빌드·검증 루프 + 보존 eval 게이트
> - [05-rn-harness-decisions](./05-rn-harness-decisions.md) — 02~04를 가로지르는 하네스 결정(D1~D12)
>
> **이 문서의 역할**: 03 rules가 *각 레이어를 무엇으로 옮기나*의 규칙 카탈로그라면, 이 문서는 그 규칙을 with-key 코드베이스 실측에 적용해 내린 **신규 RN 프로젝트의 구체 아키텍처 결정**(ADR-lite 집합 + 청사진)이다. 12개 핵심 결정(§0.2)을 grill-me 인터뷰로 확정했고, 각 결정의 *왜*와 _상태_(확정/ADR/spec 필요)를 함께 기록한다. 코드 변경은 없는 설계 문서다.

---

## 0. 한 줄 요약

> PWA를 **Expo(Managed+CNG) + Expo Router + 네이티브 Kakao SDK + TanStack Query/Zustand + apps/web BFF**로 옮긴다. 현 repo를 **모노레포로 전면 재구성**(`apps/web`+`apps/mobile`+`packages/domain`)하고, `packages/domain` 공유 + 보존 eval로 비즈니스 로직 드리프트를 막는다. dogfood는 EAS Dev Build + TestFlight/Android internal로 배포한다.

### 0.1 시스템 다이어그램 (텍스트)

```text
┌─────────────── apps/mobile (Expo RN) ───────────────┐
│  Expo Router (Stack + Tabs)                          │
│  ├─ features/*/{api,hooks,components}                │
│  ├─ TanStack Query (server state) · Zustand (UI)     │
│  ├─ auth: Kakao native SDK + SecureStore session     │
│  └─ native: expo-image, image-picker/camera, push    │
└───────┬──────────────────────────┬──────────────────┘
        │ (RLS-safe write/read)     │ (secret 필요 write)
        │ Supabase RPC 직접          │ Authorization: Bearer
        ▼                          ▼
┌─ Supabase ─────────┐   ┌─ apps/web (Next, Vercel) ───┐
│ Postgres + RLS      │   │ PWA(전환기 유지) + BFF       │
│ RPC · Storage       │◀──│ /api/* : AI·암호화·push·정산  │
│ device_push_tokens  │   │ src/lib/{ai,push,storage}   │
└─────────────────────┘   └─────────────────────────────┘
        ▲ 공유
   packages/domain (validators·keywords·challenge·bank·share + 공유 unit test)
```

### 0.2 결정 요약표 (grill-me 12)

> **상태** 범례 — `확정`: 채택 즉시 적용 / `ADR`: `docs/adr/` 기록 필요(되돌리기 비용 큼) / `spec`: `docs/superpowers/specs/` 설계 결정 필요 / ⚠️: 기존 문서·AC와 긴장(아래 §9).

| #   | 영역            | 결정                                                                   | 상태             | 본문  |
| --- | --------------- | ---------------------------------------------------------------------- | ---------------- | ----- |
| A1  | Repo 토폴로지   | 전면 restructure → `apps/web` + `apps/mobile` + `packages/domain`      | ⚠️ ADR           | §1    |
| A2  | domain 소비     | TS source 직접(no build), `@withkey/domain`, transpilePackages + Metro | 확정             | §1    |
| A3  | task 실행기     | pnpm `-r`(Turborepo 연기)                                              | 확정             | §1    |
| A4  | Expo 워크플로우 | Managed + CNG + Dev Build, New Architecture ON                         | 확정             | §2    |
| A5  | 네비게이션 셸   | Root Stack + 인증 후 Bottom Tabs[홈·내챌린지·알림·프로필]              | ⚠️ 확정(PO 승인) | §3    |
| A6  | Kakao OAuth     | 네이티브 Kakao SDK + `signInWithIdToken`(카카오톡 SSO)                 | ADR              | §4    |
| A7  | 딥링크          | Universal/App Links(https) + scheme, deferred = re-tap(MVP)            | ⚠️ 확정(PO)      | §4    |
| A8  | 쓰기/BFF        | Hybrid: RPC direct + apps/web Next API as BFF(Bearer)                  | 확정             | §5    |
| A9  | 푸시 테이블     | 신규 `device_push_tokens`, `push_subscriptions`는 cutover까지          | ADR              | §7    |
| A10 | 디자인 토큰     | Mobile-local(hex), 공유 `packages/tokens`는 cutover 후                 | spec             | §6    |
| A11 | 테스트          | RN Testing Library + jest-expo · Vitest 공유 도메인 · Maestro E2E      | 확정             | §8    |
| A12 | 앱 variant      | env별 bundle id(APP_VARIANT) ↔ EAS profile                             | 확정             | §2·§8 |

**묻지 않고 채택한 기본값**(이견 시 조정): SecureStore chunked 세션 adapter(§4) · BFF는 `Authorization: Bearer` 검증(§5) · invite 자동수락 client-side orchestration(§4) · Zustand는 ephemeral UI만, 세션은 Supabase auth listener(§6) · analytics는 `/events` BFF(RLS-safe, §5) · image 파이프라인 size 상수는 domain 공유(§7) · MVP 오프라인 persist 없음(§6) · CI에 mobile lane + EAS 빌드 트리거(§8).

---

## 1. Repo 토폴로지 & 모노레포 (A1·A2·A3)

현 repo는 root 단일 Next.js 패키지(`src/` at root, `@/* → ./src/*`, `pnpm-workspace.yaml`에 `packages:` 없음)다. 이를 **전면 모노레포로 재구성**한다.

```text
with-key/
├─ apps/
│  ├─ web/                 # 현 src/ 전체 이동 (PWA + BFF 겸임, Vercel)
│  └─ mobile/              # 신규 Expo RN 앱
├─ packages/
│  └─ domain/              # validators·keywords·challenge·bank·share + 공유 unit test
├─ supabase/               # migrations·RLS·RPC (단일 SoT, 양쪽 공유)
├─ evals/                  # harness 보존 eval 게이트
└─ pnpm-workspace.yaml     # packages: ['apps/*','packages/*']
```

### 결정과 왜

- **A1 전면 restructure (⚠️ ADR)**: `apps/web`+`apps/mobile`+`packages/domain`로 한 번에 이동. **왜**: 깨끗한 target 구조에서 시작. **단 [harness §3.2](./02-rn-migration-harness.md)의 "모노레포 전면 개편을 선행하지 않는다(점진 이동)"와 상충** → §9 후속에서 harness §3.2를 "전면 restructure 선행"으로 갱신해야 일관. restructure는 `src/lib/supabase/**` 등 인증 백본 경로 import를 일괄 바꾸므로 **ADR + Vercel root dir·CI 경로 재설정**을 동반한다.
- **A2 domain TS source 직접 (확정)**: `packages/domain`이 `dist` 없이 `./src/index.ts`를 export. `apps/web`은 `next.config.ts`의 `transpilePackages: ['@withkey/domain']`, `apps/mobile`은 Metro `watchFolders=[workspaceRoot]` + `nodeModulesPaths`로 소스 직접 해석. **왜**: build step 0, `.ts` 수정이 양 앱 즉시 반영 — "같은 소스·같은 test"([harness §3.2](./02-rn-migration-harness.md) 1차 방어선) 마찰 최소. Expo 공식 모노레포 가이드 방식.
- **A3 pnpm `-r` (확정)**: root 스크립트 `pnpm -r typecheck/lint/test`. **왜**: 앱 2~3개엔 Turborepo 캐시 이득이 작다. CI 속도가 아프면 그때 도입(Karpathy 단순함 우선).
- **TS path**: 각 앱이 자기 `tsconfig.json`을 갖고 `@/*`는 app-local. 도메인은 `@withkey/domain` workspace 패키지로만 참조(상대경로 import 금지).

### 검증

- `pnpm -r typecheck` 가 web·mobile·domain 모두 통과.
- `packages/domain` unit test가 **이동 후에도** 동일 통과(드리프트 0 증명, [harness §4 Extract 게이트](./02-rn-migration-harness.md)).

---

## 2. Expo Foundation (A4·A12)

- **A4 Managed + CNG + Dev Build, New Architecture ON (확정)**: `ios/`·`android/` 디렉터리를 git에 두지 않고 config plugin으로 선언적 생성(CNG, Continuous Native Generation). Expo Go 대신 **Dev Build**(네이티브 모듈 포함)로 개발. **왜**: camera·secure-store·notifications·Kakao SDK·(후속)MMKV가 Expo Go 범위를 넘는다. New Arch ON(SDK 52+ 기본)은 MMKV 도입 여지를 연다. 네이티브 코드 미커밋 → SDK 업그레이드가 쉬움.
- **A12 env별 bundle id (APP_VARIANT) (확정)**: `app.config.ts`가 `APP_VARIANT`(dev/staging/prod)로 bundle id·이름·아이콘·scheme·연결 도메인을 분기. EAS profile(development/preview/production)과 1:1. **왜**: 테스터가 prod를 유지한 채 dev build를 같이 설치(dogfood 필수), deep link 도메인·푸시 인증서를 환경별 분리.

```ts
// apps/mobile/app.config.ts (개념)
const variant = process.env.APP_VARIANT ?? "dev";
const ids = {
  dev: { bundleId: "app.fromwith.dev", name: "fromwith (dev)" },
  staging: { bundleId: "app.fromwith.staging", name: "fromwith (stg)" },
  prod: { bundleId: "app.fromwith", name: "fromwith" },
}[variant];
// plugins: [expo-camera, expo-secure-store, expo-notifications, kakao-login(plugin), ...]
// newArchEnabled: true
```

---

## 3. Navigation (A5)

PWA에는 하단 탭이 없다(AppHeader + push stack). RN은 **Root Stack + 인증 후 Bottom Tabs**를 새 IA로 도입한다(⚠️ 새 IA → [PRD](./01-rn-mvp-prd.md) PO 승인). 라우트 인벤토리·대응표는 [00 plan §10](./00-rn-conversion-plan.md)을 따른다.

```text
apps/mobile/app/
├─ _layout.tsx              # Root Stack + auth gate (세션 없으면 (auth)로)
├─ (auth)/
│  ├─ login/index           # 카카오 SSO + magic link fallback
│  └─ invite/[token]        # 초대 진입(미인증 시 stash → 로그인 후 복귀)
├─ (tabs)/
│  ├─ _layout.tsx           # Bottom Tabs
│  ├─ home/index            # 초기 route
│  ├─ challenges/index      # 내 챌린지
│  ├─ notifications/index
│  └─ me/index              # 프로필/설정
├─ challenge/[id]/          # 탭 위로 push. feed/dashboard/info = 화면 내 상단탭
│  ├─ index · dashboard · info · pledge
│  └─ action                # 인증 제출
├─ group/[id]               # 탭 위로 push
└─ (flow)/challenge/new     # presentation: 'modal' (풀스크린 생성 플로우)
```

### 규칙

- `router.push`=일반 이동, `router.replace`=로그인/온보딩 완료 후 뒤로가기 방지([03 §1](./03-rn-migration-rules.md)).
- 외부 진입(초대·알림)은 §4 딥링크, 내부 이동은 scheme.

---

## 4. Auth (A6·A7)

PWA 인증은 **magic link**(`signInWithOtp`, token_hash flow, ADR-0007) + **Kakao OAuth**(`exchangeCodeForSession`, ADR-0008)이고, `/auth/callback`이 세션 성립 + `accept_invite` RPC + 분석 이벤트 + welcome cushion을 한 곳에서 처리한다. RN은 이 책임을 **클라이언트로 재배치**한다.

### A6 Kakao OAuth — 네이티브 SDK (ADR)

- **네이티브 Kakao SDK + `signInWithIdToken`**: 카카오톡 앱 SSO로 id token 획득 → `supabase.auth.signInWithIdToken({ provider: 'kakao', token })`. **왜**: 카카오톡 원탭 SSO가 한국 사용자 UX 최상. **비용은 사업자등록이 아니라**(이메일 필수동의 → 비즈앱 전환은 웹 OAuth도 공통, 개인 비즈앱은 사업자번호 없이 전환 가능) **네이티브 설정**: 카카오 콘솔 플랫폼 등록(Android keyhash·iOS bundle id) + `EXPO_PUBLIC_KAKAO_NATIVE_KEY`(공개 가능 키) + config plugin + Supabase의 Kakao id token 신뢰 구성. **ADR 필요**(인증 백본 변경, [AGENTS.md §4](../../AGENTS.md) `src/lib/supabase/**` → ADR).
- **magic link**: RN에서도 fallback으로 유지. `emailRedirectTo`는 universal link(`https://<도메인>/auth/callback?token_hash=`) — 이메일 클라이언트가 custom scheme을 신뢰하지 않으므로 https로(§A7).

### A7 딥링크 — Universal/App Links + re-tap (⚠️ PO)

- **외부 진입 = Universal Links(iOS) + App Links(Android)**: `https://<도메인>/invite/<token>`·`/auth/callback`이 앱을 직접 연다. `apps/web`이 `/.well-known/apple-app-site-association`·`assetlinks.json` 호스팅. **왜**: 초대 링크는 카카오톡으로 https로 공유되므로 scheme만으론 앱이 안 열린다. 기존 invite URL 포맷 유지([03 §1](./03-rn-migration-rules.md)).
- **내부 이동 = `fromwith://`** scheme(알림 탭 → 특정 화면 등).
- **deferred(미설치 → 설치 후 자동 복구) = re-tap (MVP, ⚠️)**: Firebase Dynamic Links가 **2025-08-25 종료**되어 자동 deferred 수단이 사라졌다. MVP는 "미설치 → 웹 랜딩 → 스토어 → 설치 → 카카오톡의 같은 링크 재탭 → 앱 오픈 → 수락"으로 처리(추가 SDK 0). **왜**: Branch.io 등 전용 플랫폼은 SDK·대시보드·개인정보 처리(iOS 프라이버시) 비용이 dogfood엔 과함. **단 [PRD goal 4](./00-rn-conversion-plan.md)의 "설치 후 컨텍스트 복구"를 자동이 아닌 재탭으로 충족** → PO 확인 후속. 마찰이 크면 post-MVP에 Branch 도입.

### 세션 저장 & invite orchestration (기본값)

- **세션**: `expo-secure-store` 기반 Supabase Auth storage adapter. SecureStore의 값 크기 제한(JWT가 클 수 있음)에 대비해 **chunked adapter**로 분할 저장. 로그아웃 시 민감 데이터 제거([03 §6](./03-rn-migration-rules.md)).
- **invite 자동수락(client-side)**: deep link로 받은 `<token>`을 stash(미인증이면 SecureStore에 보관 후 로그인 라우팅) → 세션 성립(Kakao SSO/magic link) 후 RN `authService`가 `accept_invite` RPC 호출 + `invite_opened`·`user_signed_up` 분석 emit + welcome cushion 네비게이션. **왜**: `accept_invite`는 RLS-safe RPC라 클라가 직접 호출 가능 → web callback 의존 제거.

---

## 5. Data Layer & 쓰기 경로 (A8)

secret이 필요한 작업(AI 일기·계좌 암호화·푸시 발송·자동검증·정산)은 서버가 필수다. **Hybrid**로 나눈다.

| 경로                | 무엇                                                                                                           | 어디                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| RLS-safe write/read | `create_challenge`·`accept_invite`·`sign_and_maybe_activate`·`toggle_kudos`·`rename_group`·read query          | **Supabase RPC/PostgREST 직접**   |
| secret 필요 write   | `submitActionLog`(Storage+AI+push)·`revealAccountNumber`·group account 암호화·push register·settlement trigger | **apps/web Next API route (BFF)** |

### 결정과 왜

- **A8 Hybrid (확정)**: BFF는 **기존 `apps/web` Next API route 재사용** — `src/lib/{ai,push,storage}`·암호화·analytics server emitter를 Node→Deno 포팅 없이 그대로. Vercel 배포 유지(web = PWA + BFF 겸임). **왜**: OpenAI·crypto·push는 secret이라 client RPC 불가([03 §3·§0.1](./03-rn-migration-rules.md)). Edge Function 이전은 Deno 재작성 비용이 커 POC엔 과함 → cutover 후 재검토. 매핑 상세는 [00 plan §9](./00-rn-conversion-plan.md).
- **BFF 인증 = Bearer (기본값)**: web API route는 현재 cookie 세션(`@supabase/ssr`)인데 RN은 쿠키가 없다. BFF는 `Authorization: Bearer <Supabase access token>`을 받아 `supabase.auth.getUser(token)`(또는 token 기반 server client)으로 검증. `require-user`/`with-user`를 Bearer 경로로 보강(cookie 경로는 PWA용 유지).
- **service layer + TanStack Query**: `apps/mobile/features/<domain>/api/*.ts`가 RPC/BFF 호출, `hooks/use*Query.ts`가 TanStack Query. `packages/domain`은 **순수 유지**(서비스/네트워크 코드 미포함). query key·invalidate 규칙은 [03 §12](./03-rn-migration-rules.md).
- **analytics (기본값)**: `track.ts`는 service-role insert라 **RN 직접 호출 금지**. `/api/events` BFF 또는 RLS-safe insert helper로. client·server emitter가 `packages/domain`(또는 `src/lib/analytics/schema.ts`)의 **같은 Zod schema** 검증, PRD §9.1과 1:1([03 §14](./03-rn-migration-rules.md)).

### 5.1 앱 내부 구조 — feature-slice + capability layer

`apps/mobile/src`를 **도메인별 feature 슬라이스 + 네이티브 capability 격리 계층**으로 구성한다. Feature-Sliced Design(FSD, 기능 단위로 코드를 수직 분할하는 방법론)을 RN에 맞춰 단순화한 형태다. 이 절은 §5(데이터)·[§3(네비)](#3-navigation-a5)·[§6(상태)](#6-state--styling-a10)의 내부 배치를 구체화하며, 이전 §5의 transport(`shared/api`)를 `services/`로 승격한다.

```text
apps/mobile/src/
  app/                      # Expo Router = 라우팅/네비게이션 SoT (§3). 별도 navigation/ 두지 않음
  features/                 # 도메인별 슬라이스 — 옮길 때 생성(빈 슬라이스 선제 생성 X)
    auth/  group/  challenge/  proof/(인증 제출 + 자동검증 P2)  feed/
    invite/  notification/  points/(정산 P1)  profile/  recap/
    └─ 각: { api/  hooks/  components/  index.ts }
       · 도메인 로직(벌금·정산·done day·keywords)은 @withkey/domain 소비(재구현 금지)
  capabilities/             # 처음부터 — 인터페이스 뒤로 네이티브 격리
    camera/  image-picker/  image-upload/  push-notification/
    deep-linking/(re-tap→Branch 교체점, A7)  secure-storage/  app-state/(RN AppState 생명주기)
  services/                 # 인프라/전송만 (이전 §5 shared/api 승격)
    supabase/(client 싱글톤·세션 adapter)  api/(BFF fetch + Authorization: Bearer, A8)  query-client
  shared/                   # leaf: components/  hooks/  utils/  types/  theme/(mobile 토큰, A10)
```

#### 계층 의존 규칙 (eslint 강제)

"계층"은 **import 방향 규칙**이 없으면 의미가 없다. 아래를 `eslint-plugin-boundaries`(또는 `import/no-restricted-paths`)로 강제한다.

| 계층             | import 허용                                                     | 금지                                                             |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `app/`(routes)   | features · capabilities · services · shared · `@withkey/domain` | —                                                                |
| `features/*`     | capabilities · services · shared · `@withkey/domain`            | **다른 feature**(공개 API `features/x/index.ts` 경유만) · `app/` |
| `capabilities/*` | shared 만                                                       | **features · services**(capability는 leaf·device wrapper)        |
| `services/*`     | shared · `@withkey/domain`                                      | features · capabilities                                          |
| `shared/*`       | (없음, leaf)                                                    | 위 전부                                                          |

**왜**: capability가 feature를 import하기 시작하면 "격리"라는 존재 이유가 무너진다. 이 표가 없으면 매 리뷰에서 직관으로 다투게 된다.

#### capability 인터페이스 계약 (예: deep-linking)

각 capability는 **인터페이스를 export**하고 expo 구현을 그 뒤에 숨긴다. 그래야 jest-expo에서 mock 가능(A11)하고, 구현 교체(예 A7 re-tap→Branch)가 feature에 안 샌다.

```ts
// capabilities/deep-linking/index.ts
export interface DeepLinking {
  getInitialURL(): Promise<string | null>
  subscribe(handler: (url: string) => void): () => void
  // 미설치 deferred 복구가 필요해지면 이 인터페이스에 resolveDeferred()만 추가,
  // 구현을 expo-linking → Branch 로 교체. features/invite 는 무변경.
}
export const deepLinking: DeepLinking = /* expo-linking 구현 */
```

#### 규칙 (위반 시 멈추고 확인)

- **도메인 로직은 `@withkey/domain` 소비** — `features/*`는 UI·screen·RN hook·api만. 벌금/정산/done day/keyword 계산을 feature에 재구현하면 [harness §1-① 드리프트](./02-rn-migration-harness.md)가 재발한다([04 A2](#1-repo-토폴로지--모노레포-a1a2a3)).
- **`navigation/` 두지 않음** — Expo Router(A4/A5)에서 `app/`의 `_layout.tsx`가 곧 네비게이션이다. linking/deep-link 매핑은 `capabilities/deep-linking`, 셸은 `app/_layout`.
- **`services/` = 인프라 한정** — supabase client·세션 adapter·BFF fetch(Bearer, A8)·query client만. 도메인 엔드포인트 호출은 feature 응집을 위해 `features/<domain>/api`에 둔다(services를 _사용_).
- **`capabilities/app-state` = RN `AppState` 생명주기**(foreground/background/active — push 수신 처리 §7에 필요). **전역 client 상태(Zustand)는 capability가 아니다** → feature 또는 `shared`(§6).
- **feature는 lazy 생성** — 빈 7~10개를 미리 만들지 않는다. 기능을 옮길 때 그 슬라이스만 추가([harness §4](./02-rn-migration-harness.md) 기능 단위 루프와 동일 리듬). `index.ts` 공개 API는 cross-feature import가 실제 생길 때 도입.
- **`home`은 feature가 아니라 조합 화면** — 여러 feature의 공개 컴포넌트를 `app/(tabs)/home`에서 합친다(feature끼리 직접 import 금지). cross-feature 공유 타입은 `@withkey/domain`.

> **with-key 가드레일 주의**: [AGENTS.md](../../AGENTS.md)의 "`src/features/` 신설 금지"는 **Next.js 웹 앱의 colocation 패턴 전용**이다. RN 앱(`apps/mobile`)은 다른 프레임워크라 그 금지의 직접 대상이 아니다 — 단 "POC에 과잉 추상 경계 금지"라는 *의도*를 위해 capability는 처음부터, feature는 lazy로 두어 보일러플레이트를 억제한다.

---

## 6. State & Styling (A10)

- **State (기본값)**: 서버 데이터=TanStack Query, 전역 UI=**Zustand**(ephemeral만 — 모달·selected tab·플래그). 세션은 별도 store가 아니라 **Supabase `onAuthStateChange` listener** + 얇은 auth context. Redux 미도입(POC 과함). **상태**: TanStack Query·Zustand 라이브러리 채택은 spec 확정 대상([03 §0.3](./03-rn-migration-rules.md)).
- **A10 디자인 토큰 = Mobile-local (spec)**: `apps/mobile/theme/tokens.ts`에 hex 팔레트·space·radius·type scale. **왜**: web은 Tailwind v4 CSS-first(`globals.css`의 `@theme`, oklch)라 RN이 CSS 변수·oklch를 직접 못 쓴다. 공유하려면 web globals.css를 TS 기반으로 리팩터 + oklch→hex 변환이 필요해 POC 중 web 변경 비용이 크다. 시각 parity는 팔레트 수동 포팅 + screenshot QA([03 §5·§15](./03-rn-migration-rules.md))로. 공유 `packages/tokens`는 cutover 후 재검토.
- **오프라인 (기본값)**: MVP는 TanStack Query persist/오프라인 캐시 **미도입**. 진입 후 fetch가 기본([03 §12](./03-rn-migration-rules.md)).

---

## 7. Native Capability (A9)

- **A9 푸시 = 신규 `device_push_tokens` (ADR)**:

  ```text
  device_push_tokens
  - id · user_id · device_id · expo_push_token
  - platform: ios | android · app_version
  - last_seen_at · disabled_at
  RLS: self만 read/insert/update
  ```

  기존 `push_subscriptions`(Web Push: endpoint·p256dh·auth)는 **cutover까지 web 잔존**, dispatch sender가 두 테이블을 조회해 전송. **왜**: 한 테이블에 Web Push·Expo를 섞으면 nullable·분기·RLS가 지저분해진다([03 §8](./03-rn-migration-rules.md)). **migration ADR 필요**([AGENTS.md §4](../../AGENTS.md)). `src/lib/push/dispatch.ts`의 수신자 선정·quiet hours·dedup은 유지하고 sender만 Expo push로 교체.

- **이미지 (기본값)**: 렌더=`expo-image`, 선택=`expo-image-picker`, 촬영=`expo-camera`, 압축/리사이즈=`expo-image-manipulator`. **5MB/1920px/JPEG 0.85** 정책 상수는 `packages/domain`(`image/prepare-upload` 상수)에서 공유, browser canvas/heic2any 구현만 RN으로 교체. Storage는 private bucket + signed URL([03 §4·§7](./03-rn-migration-rules.md)).

---

## 8. Build · CI · Test (A11·A12)

- **EAS (A12)**: EAS Build(dev/preview/production profile) + EAS Update(JS OTA). dogfood = TestFlight + Android internal testing + EAS Update([03 §9](./03-rn-migration-rules.md)).
- **Env/secret**: `EXPO_PUBLIC_*`(앱 노출 가능 — Supabase URL·publishable key·Kakao native key)만 앱 번들에. `sb_secret_*`·`OPENAI_API_KEY`·`VAPID_PRIVATE_KEY`는 **apps/web BFF(Vercel env)에만**. EAS env는 빌드타임 값·서명용. Supabase 키 네이밍은 신규 체계 고정([supabase-keys 규칙](../../.claude/rules/common/supabase-keys.md), [03 §10](./03-rn-migration-rules.md)).
- **A11 테스트 (확정)**:
  - 단위·컴포넌트: **RN Testing Library + jest-expo**(`apps/mobile`).
  - 도메인: **기존 Vitest 공유 test**(`packages/domain`, node env) — harness 드리프트 방어선, 이동 후 동일 통과.
  - E2E: **Maestro**(`.maestro/*.yaml`) — EAS dev build 대상 smoke(로그인→홈, 챌린지 생성, 사진인증). harness eval-runner가 이 flow를 capability eval로 기록.
- **CI (기본값)**: 기존 GitHub Actions에 **mobile lane** 추가(`pnpm -r typecheck/lint/test`) + EAS 빌드 트리거(태그/수동). E2E 공유-Supabase 동시성 플레이크는 web과 동일하게 비차단 처리.

---

## 9. 후속 산출물 & 미해결 (consistency debt)

문서를 코드로 옮기기 전에 처리할 항목. **상태**가 ADR/spec인 결정은 해당 산출물이 선행 게이트다.

### 작성할 ADR/spec

| 산출물                                                       | 대상 결정                         | 트리거 경로                      |
| ------------------------------------------------------------ | --------------------------------- | -------------------------------- |
| ADR — 모노레포 전면 restructure                              | A1                                | `src/lib/supabase/**` 이동 → ADR |
| ADR — RN Kakao 네이티브 인증                                 | A6                                | `src/lib/supabase/**` 인증 백본  |
| ADR — `device_push_tokens` 신설                              | A9                                | `supabase/migrations/**`         |
| spec — server/client 상태 라이브러리(TanStack Query·Zustand) | A8·§6                             | 아키텍처 결정                    |
| spec — mobile 디자인 토큰                                    | A10                               | `apps/mobile/theme`              |
| (기존) ADR — `point_ledger`·`settlements`·immutability 예외  | [PRD §6.2·Q9](./01-rn-mvp-prd.md) | `supabase/migrations/**`         |

### 기존 문서 정합 (2026-06-04 반영 완료)

아래 3건은 source 문서에 반영해 **문서 수준 모순을 해소**했다. 단 ⓑ·ⓒ는 문서가 아니라 **PO 제품 판단**이 남아 있다.

- ✅ ⓐ **harness §3.2 정정**: "전면 restructure 선행 + `packages/domain`은 그 안에서 점진 채움(구조는 한 번에, 내용은 기능 단위)"으로 갱신([02 §3.2](./02-rn-migration-harness.md)). 남은 결정 없음(A1 ADR 작성으로 확정).
- ✅ ⓑ **00 plan goal 4 정정**: invite 복구를 "**설치=자동**(token stash→로그인→수락), **미설치=재탭**"으로 명시([00 §8 goal 4](./00-rn-conversion-plan.md)). ⚠️ **남은 PO 결정**: 재탭 UX를 MVP 수용으로 확정할지 / Branch 도입을 앞당길지.
- ✅ ⓒ **PRD §6.3 정정**: Bottom Tabs 새 IA + 외부=universal link·내부=scheme을 명시([01 §6.3](./01-rn-mvp-prd.md)). ⚠️ **남은 PO 결정**: 새 IA 승인 + 핵심 플로우 screenshot acceptance.

### 권장 부트스트랩 순서

상세 Phase는 [00 plan §6·§7](./00-rn-conversion-plan.md), 기능 단위 루프는 [harness §4](./02-rn-migration-harness.md)를 따른다. 아키텍처 관점의 선행 순서만:

1. 모노레포 restructure(A1) + `@withkey/domain` 추출(A2) → `pnpm -r typecheck` green.
2. Expo 앱 부트(A4) + `app.config` variant(A12) + EAS profile.
3. Kakao 네이티브 인증(A6) + SecureStore 세션 + deep link(A7) PoC → 로그인/세션복원/초대 재탭 성공.
4. BFF Bearer 경계(A8) + 첫 read 화면(TanStack Query).
5. 첫 mutation(RPC direct) → 사진인증(BFF) → push(`device_push_tokens`).
6. Maestro smoke + harness 보존 eval 연결.

---

## 용어집

- **App Links / Universal Links**: Android·iOS의 OS 내장 딥링크. https URL이 앱을 직접 엶(미설치 시 웹 fallback). deferred(설치 후 복구)는 미지원
- **BFF**: Backend for Frontend — RN ↔ Supabase 사이 보안 경계 서버(여기선 apps/web Next API route)
- **Bundle id / package name**: iOS·Android 앱 식별자. env별로 분리(APP_VARIANT)
- **CNG**: Continuous Native Generation — `ios/`·`android/`를 커밋하지 않고 config plugin으로 생성하는 Expo 방식
- **deferred deep linking**: 앱 미설치 시 스토어로 보내고, 설치 후 첫 실행에서 원래 링크 컨텍스트(초대 token)를 복원하는 기법
- **EAS**: Expo Application Services — Build/Update/Submit 클라우드
- **Expo Router**: 파일 기반 라우팅(React Navigation 위)
- **jest-expo**: Expo용 Jest preset(RN 단위·컴포넌트 테스트)
- **Maestro**: YAML 기반 모바일 E2E 테스트 도구
- **MMKV**: `react-native-mmkv` 고성능 네이티브 key-value 저장소(필요 시 도입)
- **monorepo restructure**: 단일 패키지 repo를 `apps/*`+`packages/*` 다중 패키지로 재구성
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(Supabase)
- **SecureStore**: `expo-secure-store` 기기 내 암호화 저장소(토큰·세션용)
- **signInWithIdToken**: 외부 provider(Kakao)의 id token을 Supabase 세션으로 교환하는 인증 메서드
- **TanStack Query / Zustand**: 서버 상태 캐시 / 경량 클라이언트 상태 라이브러리
- **transpilePackages**: Next.js가 workspace 패키지 소스를 직접 트랜스파일하게 하는 설정
