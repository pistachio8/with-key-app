# ARCHITECTURE.md

`with-key` (윗키) 프로젝트의 아키텍처 레퍼런스. AI 코딩 도구(Claude Code · Cursor · Codex)와 개발자가 프로젝트 구조를 이해하기 위해 참조한다.

이 문서는 **현재 코드베이스의 구조 지도 + 핵심 원칙 + 진입점**이다. 데이터 모델 상세는 [`BE_SCHEMA.md`](./BE_SCHEMA.md), 되돌리기 비용이 큰 결정은 [`docs/adr/`](./adr/), 절대 가드레일과 검증 게이트는 [`../AGENTS.md`](../AGENTS.md)·[`QUALITY_GATE.md`](./QUALITY_GATE.md)가 SoT(Single Source of Truth)다. 여기서는 중복하지 않고 참조한다.

> **상태(2026-06): POC 빌드 완료 → dogfood/cutover 단계.** 핵심 루프(서약→인증→AI 일기→피드/Kudos→정산표시)가 PWA로 동작하며 dogfood 중이다. React Native(Expo) 전환이 별도로 계획되어 있다([§RN 전환](#rn-expo-전환--진행-중) 참조).

## 프로젝트 개요

**with-key**는 친구·동료 3~8명이 운동 챌린지를 **서약서**로 약속하고, 사진 + 키워드 칩 원탭으로 인증하면 AI가 운동 일기를 대신 써주는 모바일 웹(PWA, Progressive Web App) 앱이다. 챌린지 종료 시 주 단위 누적 벌금이 정산표로 집계되고, recap 화면에서 공유 카드/영상을 만든다.

- **기술 스택**: Next.js **16.2.x** (App Router) · React 19.2 · TypeScript 5 · Tailwind v4 (CSS 기반) · shadcn/ui
- **백엔드**: Supabase (Postgres · Auth · Storage · RLS) · OpenAI `gpt-4o-mini` (AI 일기) · Web Push (VAPID)
- **공유 자산 생성**: `next/og` (recap 카드) · `ffmpeg-static` (recap MP4 클립)
- **배포**: Vercel (Preview/Production + Vercel Cron) · **패키지 매니저**: pnpm 10+ · Node 20 LTS

## 빌드 환경

- **Node**: 20 LTS (`.nvmrc` 고정, `engines.node >=20 <21`)
- **pnpm**: `pnpm@10.7.0` (`packageManager` 필드로 고정)
- **dev 서버**: Turbopack (`next dev` 기본)
- **린터/포맷터**: ESLint 9 (Next flat config) + Prettier 3
- **테스트**: Vitest 2 (jsdom, util·read 중심) · Playwright (E2E `test:e2e`, 접근성 `test:a11y`) · integration (`test:integration`, 원격 Supabase 대상)
- **Next 버전 pin 정책**: `next`·`eslint-config-next`는 minor line(`16.2.x`)으로 고정. patch는 수용, minor 자동 상승은 막는다 — private cache API가 experimental이라 변경 가능 ([가드레일 §Cache Components](../AGENTS.md))

품질 게이트의 실행 순서와 변경 유형별 추가 검증은 [`QUALITY_GATE.md`](./QUALITY_GATE.md) "테스트와 검증"을 따른다.

## 아키텍처 원칙

### 1. Route Colocation (FSD/bulletproof-react 반려)

Next.js 공식 권장인 **Route colocation + 얇은 공용 `src/lib`** 방식을 채택.

- Feature성 컴포넌트·Server Action은 **해당 route 아래**에 둔다 — `app/<route>/_components/*.tsx` · `app/<route>/_actions.ts`
- 언더스코어(`_`) prefix는 Next.js 라우팅에서 제외되는 공식 규약
- route group으로 레이아웃·가드를 분리: `(auth)` 미인증 · `(app)` 인증 셸(AppHeader/FAB) · `(flow)` 헤더 없는 풀스크린 플로우(챌린지 생성)
- 진짜 재사용되는 것만 `src/lib/` (도메인 유틸) + `src/components/ui/` (shadcn primitive)
- `src/features/` 폴더는 **두지 않는다**. 화면 30개 초과 시 점진 승격 검토
- **근거**: 겸임 소수 인원 POC에서 아키텍처 규약 학습 비용을 최소화. FSD 6계층·bulletproof `features/` 경계는 과설계로 판단

### 2. 쓰기는 Server Action으로 통일

- 클라이언트 → 서버 쓰기는 **Server Action** (`_actions.ts`)로 일원화 (인증·검증·로깅 단일 경로)
- Route Handler(`app/api/*`)는 **외부 콜백·기계 호출 전용**: Web Push 콜백(`api/push`) · Vercel Cron(`api/cron/*`) · 공유 자산 생성(`api/og`·`api/share`) · 클라이언트 JSON(`api/me`)
- `useEffect` + `fetch` 쓰기 금지, RSC(React Server Component) + server fetch 기본. SWR·React Query 도입 금지 (POC 범위 초과)

### 3. zod = 타입 Source of Truth

- 도메인 타입은 `src/lib/validators/` zod 스키마에서 `z.infer<>`로 도출
- DB 타입은 `pnpm db:types` 자동 생성본 `src/types/supabase.ts` (직접 수정 금지)
- `any` 금지, 불가피하면 `unknown` + 좁히기

### 4. RLS는 전 테이블 ON

- Supabase Row Level Security(행 단위 접근 제어)는 예외 없이 전 테이블 활성 (`0002_rls.sql` 강제, 이후 migration으로 보강)
- 클라이언트가 publishable key로 직접 접근하므로 **DB-level 권한이 유일한 방어선**
- Storage 사진은 **private bucket + Pre-signed URL**만 사용. Public 버킷 금지

### 5. Cache Components — 읽기 캐시 ([ADR-0019](./adr/0019-cache-components-and-service-role-policy.md)·[0021](./adr/0021-private-cache-inline-pattern.md)·[0024](./adr/0024-admin-cache-after-layer1-visibility.md))

Next.js 16 `cacheComponents: true` 활성화(`next.config.ts`). 읽기 경로는 `src/lib/db/reads/`로 분리되고, 캐시 전략이 read 함수 본문에 inline 선언된다.

- **viewer-specific private cache**: `"use cache: private"` + `cacheTag(...)` + `cacheLife(...)`를 read 함수 본문에 **직접** 선언(`user-${viewerId}-...` tag 컨벤션). wrapper로 함수를 closure 캡처하면 빌드 실패(직렬화 불가)
- **admin hydrate cache 예외** (ADR-0024): Layer 1 visibility 결정(`list-visible-action-log-ids`) 통과 후 호출되는 hydrate read(`photo-signed-url`·`action-log-hydrate`·`kudos-*`)는 `adminClient()` + public `"use cache"` 사용 가능. authorization gate가 아니며 production callsite는 `challenge-feed.ts`(Layer 1 이후)로 제한
- service-role/`adminClient` 결과는 일반 user-facing cache에 저장 금지(viewer boundary 오염 위험)

## 프로젝트 구조

```
with-key/
├─ AGENTS.md / CLAUDE.md       ← 에이전트 가드레일 · 컨텍스트 인덱스
├─ proxy.ts                    ← 루트 인증 진입점 (Next 16에서 middleware.ts → proxy.ts 리네임)
├─ next.config.ts             ← cacheComponents · serverActions bodySizeLimit(8mb) · ffmpeg tracing · 이미지 remotePatterns
├─ components.json · eslint.config.mjs · postcss.config.mjs(Tailwind v4) · vitest.config.ts
│
├─ public/                    ← PWA manifest · service-worker.js · 아이콘
│
├─ src/
│  ├─ app/                    ← Next.js App Router
│  │  ├─ page.tsx             ← / → /home or /login 리다이렉트
│  │  ├─ layout.tsx · globals.css
│  │  ├─ (auth)/              ← 미인증 전용 (login · invite/[token])
│  │  ├─ (app)/               ← 인증 셸 (AppHeader · FabMenu)
│  │  │  ├─ home/
│  │  │  ├─ challenge/[id]/
│  │  │  │  ├─ (tabs)/        ← feed · dashboard · info 탭 (ADR-0010)
│  │  │  │  ├─ action/        ← 사진+키워드 인증
│  │  │  │  ├─ pledge/        ← 서약 서명
│  │  │  │  └─ recap/         ← 종료 정산·공유
│  │  │  ├─ group/[id]/ · group/new/
│  │  │  ├─ me/ · me/challenges/
│  │  │  ├─ notifications/
│  │  │  ├─ legal/{privacy,terms}/
│  │  │  └─ {action,feed,pledge,recap,settings}/  ← legacy redirect (deep-link 호환)
│  │  ├─ (flow)/              ← 헤더 없는 플로우
│  │  │  └─ challenge/new/ · new/done/[id]/
│  │  ├─ auth/                ← callback · dev-login Route Handler
│  │  └─ api/
│  │     ├─ me/route.ts                       ← 현재 user JSON
│  │     ├─ push/route.ts                     ← Web Push 콜백/health
│  │     ├─ cron/{deadline-push,cleanup-kudos-push-log}/  ← Vercel Cron
│  │     ├─ og/recap-card/route.tsx           ← recap 공유 이미지 (next/og)
│  │     └─ share/recap-clip/route.ts         ← recap MP4 (ffmpeg)
│  │
│  ├─ components/             ← ui(shadcn primitive) · app-shell · auth · pledge · pwa
│  │
│  └─ lib/
│     ├─ supabase/            ← client · server · middleware(updateSession) · admin
│     ├─ auth/                ← getClaims 가드 · in-app-browser · require-user · with-user
│     ├─ db/reads/            ← 읽기 경로 분리 + Cache Components 캐시 (31개 read 모듈)
│     ├─ actions/             ← Server Action result/error shape
│     ├─ ai/                  ← prompts(PROMPT_VERSION) · diary(4.5s 타임아웃·폴백) · cost
│     ├─ keywords/            ← pool(freeze) · shuffle(reroll cap)
│     ├─ challenge/           ← done day · duration · frequency · penalty · settlement · streak · lifecycle
│     ├─ share/              ← recap 공유 기간 · seed · pick
│     ├─ image/ · storage/    ← 사진 리사이즈/업로드 · Storage path
│     ├─ push/ · notifications/ ← VAPID send · Quiet Hours · dispatch · 알림 store
│     ├─ groups/ · bank/ · crypto/ · invite/ ← 그룹명 · 은행코드 · 계좌 암호화 · 초대 URL
│     ├─ analytics/track.ts   ← AnalyticsEvent 유니온 (PRD §9.1과 1:1)
│     └─ validators/          ← user · challenge · action-log · group · kudos · push (zod SoT)
│
├─ supabase/
│  ├─ migrations/             ← 0001 ~ 0041 (단방향, 번호 맨 뒤 추가만)
│  ├─ seed.sql · README.md
│
├─ evals/                     ← AI agent eval harness (tasks · results, append-only)
└─ scripts/                   ← check-env · copy-ffmpeg · validate-doc-paths · check-spec-required · new(scaffold) …
```

> 구조는 지도다. 정확한 라우트별 책임·RN 전환 분류는 [`migration/00-rn-conversion-plan.md §1`](./migration/00-rn-conversion-plan.md)에 표로 정리돼 있다.

## 인증 & 세션

- **@supabase/ssr** 기반. `createBrowserClient`(`lib/supabase/client.ts`) / `createServerClient`(`server.ts`) / `adminClient`(`admin.ts`, service-role) 경로 분리
- 루트 **`proxy.ts`** (Next 16에서 `middleware.ts` 리네임)가 `lib/supabase/middleware.ts`의 `updateSession()`을 호출 → 쿠키 리프레시 + 미인증 시 `/login` 리다이렉트. `/`·`/login`·`/invite/*`·정적 자산은 가드 예외
- **세션 검증 표준** ([ADR-0022](./adr/0022-auth-getuser-standardization.md) → [ADR-0023](./adr/0023-auth-getclaims-replace-getuser.md)): `getUser()` 표준화 후 `getClaims()`로 교체 — JWT claims를 로컬 검증해 매 요청 Auth 서버 왕복을 줄임
- **로그인** ([ADR-0008](./adr/0008-kakao-oauth-introduction.md)): 1차 카카오 OAuth, 비상 fallback 이메일 매직링크(`NEXT_PUBLIC_ENABLE_MAGIC_LINK` 토글). `auth/callback/route.ts`가 공통 callback — invite next 자동 가입(`accept_invite` RPC) · `?welcome=` cushion · signup/invite emit. `auth/dev-login`은 개발 전용
- **인앱뷰 가드** (ADR-0008): 카카오톡·인스타·페북·네이버·라인 인앱브라우저는 OAuth 쿠키 유지가 불안정 → 외부 브라우저 전환 안내. `lib/auth/in-app-browser.ts` + `components/auth/*`, `/login`·`/invite/[token]`에서 SSR UA 1차 분기 + hydration 보강

## 데이터 모델 (BE_SCHEMA §5 = SoT)

핵심 테이블 그룹 — 정확한 컬럼·제약·인덱스·RLS·상태 전이는 [`BE_SCHEMA.md`](./BE_SCHEMA.md)가 SoT다.

```
users · groups · group_members · invites
challenges · challenge_participants
action_logs(AI 일기·인증 사진·키워드 흡수) · kudos
push_subscriptions · notification_prefs · kudos_push_log
events(분석) · ai_cost_log
```

- 스키마는 `supabase/migrations/0001 ~ 0041`로 누적(단방향, down 없음). 상태 전이·RPC(`create_challenge`·`accept_invite`·`sign_and_maybe_activate`·`start_challenge_with_signed_participants` 등)는 migration에 정의
- 주요 결정: 그룹 = 영속 crew([ADR-0012](./adr/0012-group-persistent-crew-model.md)) · 그룹당 active 챌린지 1개(`0029`) · 챌린지 종료 경계 KST 자정([ADR-0026](./adr/0026-challenge-end-boundary-kst-midnight.md)) · 파생 우선 정산([ADR-0027](./adr/0027-derived-over-autoclose.md))

## AI 일기 생성 (`src/lib/ai/`)

PRD §5.3 AC를 구조로 박았다. 변경 시 `PROMPT_VERSION` bump + spec.

- **입력**: `{ activityType, keywords[1~3], memo?, photoCaption? }`
- **타임아웃**: 4.5초 (`AbortController`, P95 5초 AC에 0.5초 버퍼)
- **키워드 강제**: 응답에 선택 키워드 미포함 시 `keywordCoverage < 1` → `templateFallback()`(동일 키워드 재사용 1줄). 사용자에게 실패가 드러나지 않음
- **로그**: 프롬프트/응답 본문 미기록. 메타만(`latencyMs`·`fallback`·`keywordCoverage`·`promptVersion`). 비용은 `ai_cost_log`

## 키워드 풀 (`src/lib/keywords/`)

- `pool.ts`: `activityType → string[]`. **v1.0 freeze**(POC) · v1.1(meal 추가, [ADR-0015](./adr/0015-meal-activity-type.md)) · **이후 변경 금지**(PRD §4.6 분석 편향 방지). 변경 시 PO 승인 + VALIDATION 재논의
- `KEYWORD_POOL_VERSION` 상수를 `keywords_shown`·`action_logged` 이벤트에 inject(분석 분기 marker)
- `shuffle.ts`: 비복원 랜덤 추출 + reroll(`REROLL_LIMIT`). 노출 스냅샷은 서버 전송으로 재현 가능

## 이벤트 로깅 (`src/lib/analytics/track.ts`)

- `AnalyticsEvent` 유니온이 PRD §9.1 이벤트 표와 **1:1**. 임의 이벤트 추가 금지(PO 승인 + spec)
- `track(event)` 단일 함수. 서버 이벤트(AI 성공/실패·알림 발송)도 동일 함수로. Supabase `events` 테이블 insert

## Web Push & 알림 (`src/lib/push/` · `notifications/`)

- VAPID 키는 env 관리(키 변경 시 전 구독 무효화). 구독은 `push_subscriptions`, 사용자 설정은 `notification_prefs`(기본 off, [ADR-0013](./adr/0013-notification-prefs-default-off.md))
- `isQuietHoursKST()`가 새벽 2~7시(KST) 발송 차단
- **dispatch 종류**: 마감 임박(`api/cron/deadline-push` + active 만기 auto-close) · 친구 인증 완료 · Kudos · 전원 서명 owner nudge([ADR-0028](./adr/0028-all-signed-owner-start-nudge.md)). Kudos push 중복은 `kudos_push_log` dedup 테이블([ADR-0017](./adr/0017-kudos-push-log-dedup-table.md))로 차단(TTL cleanup cron)
- 알림센터는 service worker가 IndexedDB에 저장(`/notifications` 화면)

## 정산 · recap · 공유 (`src/lib/challenge/` · `share/` · `api/og`·`api/share`)

- **챌린지 lifecycle**: 서약(전원 서명 시 활성화) → 인증(done day, KST distinct day) → 종료(KST 자정 경계) → 정산. early-close 정산 cutoff는 [ADR-0030](./adr/0030-early-close-settlement-cutoff.md)
- **벌금/정산**: 주 단위 누적 모델(`confirmedPenalty`). POC는 "표시만"(penalty_displayed). 계좌는 `crypto/`로 암호화 저장, reveal은 서버 전용
- **recap 공유**: `api/og/recap-card`(next/og 이미지) · `api/share/recap-clip`(ffmpeg MP4, [ADR-0025](./adr/0025-recap-share-clip-render-infra.md)). ffmpeg 바이너리는 `scripts/copy-ffmpeg.mjs`가 symlink 밖 실경로로 복사해 Vercel 번들 트레이싱(`next.config.ts outputFileTracingIncludes`)

## 빌드 & 배포

```bash
pnpm dev                 # Turbopack dev
pnpm build && pnpm start
pnpm typecheck           # tsc --noEmit
pnpm lint                # ESLint
pnpm test                # Vitest
pnpm test:e2e            # Playwright E2E
pnpm db:push             # 원격 Supabase migration 적용
pnpm db:types            # Supabase 타입 생성
pnpm validate:docs       # 문서 내부 링크 검사
```

- **Vercel**: `main`/`develop` 연결, PR마다 Preview URL(모바일 Safari QA). Vercel Cron이 `api/cron/*` 구동. env는 Vercel Environment Variables에만(메신저 공유 금지)
- **Supabase**: 모든 DDL은 `supabase/migrations/000X_<snake_case>.sql`로만(Studio 직접 수정 금지). 번호는 맨 뒤에만 추가, 재정렬·down 없음(POC 단방향). 키는 **신규 체계**(`sb_publishable_*`/`sb_secret_*`)만 ([ADR-0001](./adr/0001-supabase-publishable-secret-keys.md))

## 환경 변수

`.env.example`에 전체 목록. 핵심 주의점:

- 서버 전용 키(`SUPABASE_SECRET_KEY`·`OPENAI_API_KEY`·`VAPID_PRIVATE_KEY`)에 `NEXT_PUBLIC_` 접두 금지 — 클라이언트 번들 유출
- Supabase 키 네이밍: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(클라) / `SUPABASE_SECRET_KEY`(서버). 레거시 `ANON_KEY`/`SERVICE_ROLE_KEY` 명칭 금지
- 프로덕션 secret은 Vercel Environment Variables에만. 새 env 추가 시 `.env.example` 주석 동기화

## 모니터링

- **Vercel Logs**(서버 런타임) + **Vercel Analytics**(Web Vitals)
- `lib/logger.ts`는 JSON-line 출력, userId만 포함(이메일/이름 금지). AI·알림 본문 미기록
- Sentry는 선택 — 프로덕션 예외 지속 시 도입

## RN (Expo) 전환 — 진행 중

현재 PWA를 React Native(Expo) 앱으로 전환하는 작업이 별도로 계획되어 있다. 본 문서는 **현재 PWA 코드**를 기술하며, 전환 설계는 아래를 참조한다.

- [`migration/00-rn-conversion-plan.md`](./migration/00-rn-conversion-plan.md) — 라우트/기능별 재사용·재작성 분류, Phase 0~8
- [`migration/01-rn-mvp-prd.md`](./migration/01-rn-mvp-prd.md) — RN MVP 범위(P0 포팅 + P1 포인트 정산 + P2 사진 자동검증)
- [`migration/02-rn-migration-harness.md`](./migration/02-rn-migration-harness.md) — 기능 단위 마이그레이션을 반복·검증하는 하네스(작업환경·루프·보존 eval)

## 참조 문서

- [`../AGENTS.md`](../AGENTS.md) — 절대 가드레일 · 작업 프로토콜 (SoT)
- [`QUALITY_GATE.md`](./QUALITY_GATE.md) — 공통 품질 기준 · 검증 게이트
- [`PRD.md`](./PRD.md) — 기능 스펙 · AC · 이벤트 · 데이터 모델
- [`BE_SCHEMA.md`](./BE_SCHEMA.md) — 테이블 · 제약 · 인덱스 · RLS · 상태 전이 SoT
- [`adr/`](./adr/) — 되돌리기 비용이 큰 결정 (Nygard 풀 포맷) · [`DECISIONS.md`](./DECISIONS.md) · [`TEAM_SHARE_DECISIONS.md`](./TEAM_SHARE_DECISIONS.md) (ADR-lite)
- [`ONBOARDING.md`](./ONBOARDING.md) — Day 1 실행 가이드 · [`VALIDATION.md`](./VALIDATION.md) — GO/NO-GO 지표
- [`IDEATION.md`](./IDEATION.md) — 제품 "왜" · 페르소나 · [`KICKOFF.md`](./KICKOFF.md) — D0 스택 스냅샷(수정 금지)

## 용어집

- **PWA(Progressive Web App)**: 브라우저로 설치 가능한 웹 앱
- **RSC(React Server Component)**: 서버에서 렌더되는 React 컴포넌트, 클라이언트 번들 미포함
- **RLS(Row Level Security)**: Postgres 행 단위 접근 제어, Supabase에서 전 테이블 활성
- **Cache Components**: Next.js 16의 `"use cache"`·Partial Prerender 기능. 읽기 경로 캐시에 사용
- **Server Action**: Next.js 서버 측 쓰기 처리 함수. 클라이언트→서버 쓰기의 단일 경로
- **SoT(Source of Truth)**: 중복 정의 없이 기준으로 삼는 단일 원본
- **ADR(Architecture Decision Record)**: 되돌리기 비용이 큰 결정의 기록. `docs/adr/`에 누적
- **proxy.ts**: Next 16에서 `middleware.ts`가 리네임된 인증 진입점 파일
