# docs/junior/ARCHITECTURE.md — 아키텍처 레퍼런스 (주니어판)

> **원본**: [`../ARCHITECTURE.md`](../ARCHITECTURE.md). 두 문서가 어긋나면 원본이 기준.

## 이 문서는 무엇인가

`with-key`(윗키) 저장소의 **구조와 아키텍처 원칙**을 정리한 문서입니다. AI 코딩 도구(Claude Code·Cursor)와 사람 개발자가 프로젝트에 처음 들어올 때 "이 저장소는 어떤 모양인가"를 파악하기 위한 지도 역할입니다.

## 프로젝트 개요

`with-key`는 친구 3~4명이 주간 운동 챌린지를 **서약서** 형태로 약속하고, 사진 + 키워드 칩 **원탭**으로 인증하면 AI가 운동 일기를 대신 써주는 **모바일 웹(PWA)** POC(Proof of Concept, 개념 증명)입니다.

- **기간**: POC 2주
- **기술 스택**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui
- **백엔드**: Supabase (Postgres · Auth · Storage) · OpenAI `gpt-4o-mini` · Web Push (VAPID)
- **배포**: Vercel
- **패키지 매니저**: pnpm · Node 20 LTS

## 빌드 환경

- **Node**: 20 LTS (Long Term Support, 장기 지원 버전) — `.nvmrc`로 고정, `engines.node >=20 <21`
- **pnpm**: 10+ (`packageManager` 필드로 고정)
- **dev 서버**: Turbopack (`next dev`의 기본 번들러)
- **린터/포맷터**: ESLint (Next flat config) + Prettier
- **테스트**: Vitest (jsdom 환경, 유틸 중심)

---

## 아키텍처 원칙

네 가지 원칙이 이 프로젝트의 대부분의 결정을 설명합니다. 순서대로 읽으면 프로젝트의 "스타일"이 보입니다.

### 1. Route Colocation — 화면 옆에 파일을 둔다

**Next.js 공식 권장인 "Route colocation + 얇은 공용 `src/lib`"** 방식을 채택합니다. FSD(Feature-Sliced Design)나 bulletproof-react 같은 상위 아키텍처는 **도입하지 않습니다**.

- 기능성(feature) 컴포넌트와 Server Action은 **해당 route 아래**에 둡니다.
  - 예: `src/app/(app)/action/_components/*.tsx`
  - 예: `src/app/(app)/action/_actions.ts`
- 언더스코어(`_`) prefix는 **Next.js가 라우팅에서 제외**하는 공식 규약입니다. 폴더 이름에 언더스코어가 붙으면 URL로 노출되지 않아, 컴포넌트·액션 파일을 route 옆에 함께 둘 수 있습니다.
- 진짜 **여러 곳에서 재사용되는 것만** `src/lib/` (도메인 유틸) + `src/components/ui/` (shadcn primitive)에 둡니다.
- `src/features/` 폴더는 **두지 않습니다**. 화면 수가 30개를 넘으면 재검토합니다.

**왜 이렇게 했나**: POC 2주 · 겸임 2인 환경에서 아키텍처 규약 학습 비용을 0에 가깝게 만들기 위해서입니다. FSD의 6계층이나 bulletproof의 `features/` 경계는 지금 단계에서는 **과설계(overengineering)** 로 판단했습니다.

### 2. 쓰기는 Server Action으로 통일한다

클라이언트에서 서버로 "쓰기(mutation)"가 필요할 때 사용할 수 있는 채널은 크게 세 가지가 있습니다: Route Handler(`app/api/*`), Server Action, `useEffect + fetch`. 이 프로젝트는 이 중 **Server Action 하나로 통일**합니다.

- **Route Handler (`app/api/*`)**: **외부 콜백 전용**. 예를 들어 Web Push 서비스가 보내는 콜백처럼, "브라우저가 아닌 외부 시스템"이 호출하는 엔드포인트에만 사용합니다.
- **Server Action (`_actions.ts`)**: 클라이언트 → 서버 쓰기는 전부 이 경로로 일원화.
- **`useEffect` + `fetch`**: **금지**. 읽기도 기본은 RSC(React Server Component, 서버 컴포넌트)에서 `fetch` 호출로 해결합니다.
- **SWR · React Query**: **도입 금지**. POC 범위를 넘고, 쓰기가 Server Action으로 일원화되면 클라이언트 캐시 계층이 필요하지 않습니다.

### 3. zod = 타입의 Source of Truth

SoT(Source of Truth, 단일 출처)란 "같은 정보가 두 군데에 따로 정의되어 서로 어긋나지 않도록, 한 곳만 진실로 인정하는 원칙"입니다. 이 프로젝트에서는 **도메인 타입의 SoT가 zod 스키마**입니다.

- 도메인 타입은 `src/lib/validators/`의 **zod 스키마**에서 `z.infer<>`로 도출합니다. 같은 개념을 TypeScript 타입 따로, zod 따로 선언하지 않습니다.
- DB 타입은 향후 `supabase gen types typescript` 명령으로 `src/types/supabase.ts`에 자동 생성할 예정입니다.
- `any` **금지**. 피할 수 없으면 `unknown`을 쓰고, 사용 전에 타입 좁히기(narrowing)로 구체화합니다.

### 4. RLS는 예외 없이 전 테이블 ON

RLS(Row Level Security, 행 단위 접근 제어)는 Postgres/Supabase의 기능으로, 테이블의 **각 행에 대해 누가 읽고 쓸 수 있는지**를 SQL 정책으로 선언합니다.

- Supabase RLS는 **예외 없이 전 테이블 활성**화합니다. 초기화 마이그레이션은 `supabase/migrations/0002_rls.sql`에 모여 있습니다.
- Storage 사진은 **Pre-signed URL**(사전 서명된 임시 URL)만 사용합니다. 공개 버킷은 만들지 않습니다.

**왜 이렇게 했나**: 서비스 롤 키로 모든 쿼리를 수행하는 구조는 한 번만 실수해도 전체 데이터가 노출됩니다. RLS를 기본으로 두면 "사용자 컨텍스트로 붙었을 때 그 사용자만 자기 데이터에 접근"이 DB 레벨에서 보장됩니다.

---

## 프로젝트 구조

```
with-key/
├─ AGENTS.md                  ← Next.js 16 공식 안내 (AI 도구용)
├─ README.md                  ← Quick Start
├─ .env.example               ← env 템플릿
├─ .nvmrc                     ← Node 20
├─ components.json            ← shadcn/ui 설정
├─ eslint.config.mjs
├─ middleware.ts              ← Supabase 세션 리프레시 (루트 미들웨어)
├─ next.config.ts
├─ package.json
├─ pnpm-workspace.yaml
├─ postcss.config.mjs         ← Tailwind v4 (CSS 기반, 별도 config 파일 없음)
├─ tsconfig.json
├─ vitest.config.ts
│
├─ public/                    ← (예정) PWA manifest · 아이콘
│
├─ src/
│  ├─ app/                    ← Next.js App Router
│  │  ├─ page.tsx             ← / → /login 또는 /home 서버 리다이렉트
│  │  ├─ layout.tsx · globals.css
│  │  ├─ (auth)/              ← 미인증 사용자 전용
│  │  │  ├─ login/page.tsx
│  │  │  └─ invite/[token]/page.tsx
│  │  ├─ (app)/               ← 인증된 사용자만 접근
│  │  │  ├─ home/page.tsx
│  │  │  ├─ feed/page.tsx
│  │  │  ├─ action/page.tsx
│  │  │  ├─ pledge/page.tsx
│  │  │  ├─ recap/page.tsx
│  │  │  └─ settings/page.tsx
│  │  └─ api/
│  │     └─ push/route.ts     ← 외부 콜백 Route Handler만
│  │
│  ├─ components/
│  │  └─ ui/                  ← shadcn primitive (버튼·입력 등 기본 부품)
│  │     ├─ button.tsx
│  │     ├─ input.tsx
│  │     ├─ dialog.tsx
│  │     └─ sonner.tsx
│  │
│  └─ lib/
│     ├─ utils.ts             ← shadcn cn() 헬퍼 (className 병합)
│     ├─ logger.ts            ← JSON-line 로거 (PII 제외)
│     ├─ supabase/
│     │  ├─ client.ts         ← createBrowserClient (브라우저용)
│     │  ├─ server.ts         ← createServerClient (서버용, cookies 연동)
│     │  └─ middleware.ts     ← updateSession (세션 리프레시 + 가드)
│     ├─ ai/
│     │  ├─ prompts.ts        ← PROMPT_VERSION · system/user 템플릿
│     │  └─ diary.ts          ← OpenAI 호출 + 4.5초 타임아웃 + 키워드 폴백
│     ├─ keywords/
│     │  ├─ pool.ts           ← activityType → 키워드 배열 (PRD §4.6)
│     │  ├─ shuffle.ts        ← 비복원 랜덤 + reroll 상태 (cap 5)
│     │  └─ shuffle.spec.ts
│     ├─ push/
│     │  ├─ vapid.ts          ← VAPID 세팅
│     │  └─ send.ts           ← sendPush + KST Quiet Hours
│     ├─ analytics/
│     │  └─ track.ts          ← AnalyticsEvent 유니온 (PRD §9.1과 1:1 매핑)
│     └─ validators/
│        ├─ user.ts
│        ├─ challenge.ts
│        ├─ action-log.ts     ← 키워드 풀 소속 검증
│        └─ kudos.ts
│
├─ supabase/
│  ├─ migrations/
│  │  ├─ 0001_init.sql        ← (BE가 채울 예정) 9개 테이블 스키마
│  │  └─ 0002_rls.sql         ← (BE가 채울 예정) RLS 전 테이블 ON
│  ├─ seed.sql
│  └─ README.md
│
└─ scripts/
   ├─ reset-db.sh
   └─ check-env.ts
```

### 읽는 법

- `src/app/**`이 **화면과 API의 표면**입니다. 거의 모든 실제 동작이 여기서 시작됩니다.
- `src/lib/**`는 **화면에 얽매이지 않는 도메인 유틸**입니다. 여러 route에서 재사용되는 로직만 올라옵니다.
- `supabase/migrations/**`가 **DB 스키마의 SoT**입니다. Studio(Supabase GUI)에서 직접 고치지 않고 이 SQL을 통해서만 바꿉니다.

---

## 인증 & 세션

`with-key`의 인증은 **`@supabase/ssr`** 기반입니다. 이 패키지는 Supabase 세션을 Next.js의 서버/클라이언트 양쪽에서 쿠키로 일관되게 유지해 줍니다.

- 브라우저에서는 `createBrowserClient`를 씁니다 (`src/lib/supabase/client.ts`).
- 서버(RSC, Server Action, Route Handler)에서는 `createServerClient`를 씁니다 (`src/lib/supabase/server.ts`). Next.js의 `cookies()` API와 연동되어 요청마다 세션 쿠키를 읽고 씁니다.
- 루트 `middleware.ts`가 매 요청마다 `updateSession()`을 호출해 **쿠키 리프레시**(만료 직전 갱신)와 **미인증 가드**를 처리합니다. 미인증이면 `/login`으로 리다이렉트합니다.
- 가드 예외 경로: `/`, `/login`, `/invite/*`. (홈, 로그인, 초대 링크는 미인증에서도 접근 가능)
- 정적 자산과 이미지 경로는 middleware matcher에서 제외합니다. (불필요한 세션 갱신을 피하기 위해)

---

## 데이터 모델 (PRD §8)

총 9개 테이블. Day 1에 BE 담당자가 `supabase/migrations/0001_init.sql`에 채웁니다. 상세 스키마·제약·상태 전이는 [`BE_SCHEMA.md`](./BE_SCHEMA.md)를 참고하세요.

```
users · groups · group_members
challenges · challenge_participants
action_logs · feed_items · kudos
push_subscriptions
```

**핵심 인덱스** (PRD §8.3 — 자주 조회되는 컬럼 조합에 미리 걸어두는 인덱스):

- `challenges(group_id, status)` — 그룹별 진행 중 챌린지 조회
- `action_logs(challenge_id, user_id, created_at DESC)` — 챌린지 내 사용자의 최근 인증
- `action_logs(user_id, created_at DESC)` — "오늘 인증했나?" 조회
- `action_logs USING GIN (selected_keywords)` — Week 2 키워드 분포 분석용 (GIN은 배열/JSON 같은 복합 타입을 인덱싱하기 위한 Postgres 인덱스 타입)
- `kudos(feed_item_id)` — 피드 아이템당 응원 집계

---

## AI 일기 생성 (`src/lib/ai/`)

PRD §5.3의 수락 기준(AC, Acceptance Criteria)을 구조로 박았습니다. 즉 "일기가 생성되었다"고 판정하기 위한 조건을 코드 흐름 자체에 녹였습니다.

- **입력**: `{ activityType, keywords[1~3], memo?, photoCaption? }`
- **타임아웃**: **4.5초**. PRD의 P95(95th percentile, 95번째 백분위 — 100번 중 95번이 이 값 아래로 끝난다는 지연 목표) 5초 AC에 **0.5초 버퍼**를 둔 값. `AbortController`로 구현합니다.
- **키워드 강제**: 응답에 선택 키워드가 모두 포함되지 않으면 `keywordCoverage < 1`로 판정 → **템플릿 폴백**으로 넘어갑니다.
- **템플릿 폴백**: `templateFallback()`이 같은 키워드를 재사용한 1줄 문구를 생성합니다. 사용자 입장에서는 실패가 드러나지 않습니다.
- **로그**: 프롬프트/응답 **본문은 기록하지 않습니다**. 메타데이터만 남깁니다(`latencyMs`, `fallback`, `keywordCoverage`, `promptVersion`). 개인정보·메모 본문이 로그에 섞이는 것을 막기 위한 조치입니다.

---

## 키워드 풀 (`src/lib/keywords/`)

- `pool.ts`: `activityType → string[]` 매핑을 **하드코딩**합니다 (PRD §4.6 v1). DB가 아닌 코드에 고정된 이유는 분석 편향을 막기 위해서입니다.
- **POC 기간 중 변경 금지** — 중간에 풀을 바꾸면 Week 1과 Week 2의 키워드 분포가 달라져 분석이 오염됩니다. 변경 시 PO 승인 + Validation Plan 재논의가 필요합니다.
- `shuffle.ts`: **비복원 랜덤 추출**(한 번 뽑힌 항목은 같은 세션에서 다시 뽑히지 않음), 6~9개 노출. `REROLL_LIMIT = 5` (같은 세션에서 최대 5회까지 리롤 가능).
- 사용자가 실제로 본 키워드 스냅샷은 `action_logs.shown_keywords`로 서버에 저장합니다 → 분석·재현 가능.

---

## 이벤트 로깅 (`src/lib/analytics/track.ts`)

- `AnalyticsEvent` **유니온 타입**이 PRD §9.1의 이벤트 표와 **1:1**로 대응됩니다. 유니온 타입이란 "A or B or C" 중 하나만 허용하는 TypeScript 타입이고, 이 경우 "정의된 이벤트만 보낼 수 있다"는 뜻입니다.
- `track(event)` 단일 함수만 제공합니다. 이벤트 추가는 **PO 승인**이 필요합니다(분석 스키마가 예고 없이 바뀌지 않도록).
- POC 초기엔 Supabase `events` 테이블 insert로 구현 예정(현재는 dev console log).
- 서버 이벤트(AI 성공/실패, 알림 발송)도 같은 `track()` 함수를 서버에서 호출합니다.

---

## Web Push

Web Push는 브라우저가 닫혀 있어도 알림을 받을 수 있게 해주는 W3C 표준입니다. 서버가 VAPID(Voluntary Application Server Identification) 키 쌍으로 알림을 서명해 브라우저 벤더의 푸시 서비스를 통해 전달합니다.

- VAPID 키는 `.env.local`에서 관리합니다. **키를 바꾸면 기존 구독이 모두 무효화**되므로 주의합니다.
- `src/lib/push/send.ts`의 `isQuietHoursKST()`가 새벽 2~7시(한국 표준시, KST)에는 발송을 차단합니다.
- 구독 정보는 `push_subscriptions` 테이블에 저장합니다.

---

## 빌드 & 배포

### 로컬

```bash
pnpm dev              # Turbopack dev 서버
pnpm build
pnpm start            # 프로덕션 서버
pnpm lint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest (util 중심)
```

### Vercel

- `main`/`develop` 브랜치를 Vercel에 연결합니다.
- PR마다 **Preview URL**(일회성 미리보기 URL)이 자동 발급됩니다 → 모바일 Safari에서 QA.
- 환경 변수는 **Vercel Environment Variables**에 저장합니다. Slack/메신저 공유 금지(한 번 공유되면 로그·캐시에 남을 수 있음).

### Supabase

- 로컬: Docker Desktop + `pnpm supabase start`. Studio는 `localhost:54323`.
- **모든 DDL은 `supabase/migrations/*.sql`로만 반영합니다. Studio 직접 수정 금지.**
- 파일명은 `000X_<snake_case>.sql`. 번호는 **맨 뒤에만 추가**, 재정렬·삭제 금지.
- down 스크립트(되돌리기용 SQL)는 만들지 않습니다 — POC는 단방향.

---

## 환경 변수

`.env.example`에 전체 목록이 있습니다. 핵심 주의점:

- `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`는 **서버 전용** — `NEXT_PUBLIC_` 접두 금지.
- Supabase 키 네이밍: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (클라이언트) / `SUPABASE_SECRET_KEY` (서버). 레거시 `ANON_KEY` / `SERVICE_ROLE_KEY` 명칭은 사용하지 않습니다.
- `NEXT_PUBLIC_*` 변수는 **클라이언트 번들에 포함**되므로 민감값은 절대 넣지 않습니다.
- 프로덕션 시크릿은 **Vercel Environment Variables**에만 저장합니다.

---

## 모니터링

- **Vercel Logs** (서버 런타임 로그) + **Vercel Analytics** (Web Vitals — LCP/INP 같은 프론트엔드 성능 지표)
- **Sentry는 선택**. 프로덕션 예외가 지속 발생하면 도입(환경 변수 추가 + 소스맵 업로드).
- `src/lib/logger.ts`는 JSON-line 형식으로 출력하며, `userId`만 포함합니다 (이메일/이름은 로그에 남기지 않습니다 — PII 보호).

---

## 참조 문서

- [`CLAUDE.md`](./CLAUDE.md) — AI 도구 작업 규칙
- [`PRD.md`](./PRD.md) — 기능 스펙 · AC · 이벤트 · 데이터 모델
- [`BE_SCHEMA.md`](./BE_SCHEMA.md) — 테이블 · 제약 · 인덱스 · RLS · 상태 전이 SoT
- [`ONBOARDING.md`](./ONBOARDING.md) — Day 1 실행 가이드
- [`DECISIONS.md`](./DECISIONS.md) — ADR-lite, 되돌리기 비용이 큰 결정 누적
- [`VALIDATION.md`](./VALIDATION.md) — Week 2 GO/NO-GO 지표
- [`IDEATION.md`](./IDEATION.md) — 제품 "왜" · 페르소나 · 가설
- [`KICKOFF.md`](./KICKOFF.md) — 기술 스택 확정본 (D0 스냅샷)

---

## 용어집

- **AC (Acceptance Criteria, 수락 기준)** — 기능이 "완료"로 판정되기 위한 체크 조건.
- **App Router** — Next.js 13+에서 도입된 라우팅 방식. `src/app/` 하위 폴더 구조가 URL 구조와 1:1 매핑.
- **Colocation (코로케이션)** — 관련 파일을 멀리 떨어진 중앙 폴더에 모으지 않고 사용처 바로 옆에 두는 설계 방식. 이 프로젝트는 route colocation 채택.
- **FSD (Feature-Sliced Design)** — 대형 프론트엔드 프로젝트에서 도메인을 6개 계층(app/pages/widgets/features/entities/shared)으로 나누는 아키텍처 방법론. 이 프로젝트에서는 **채택 안 함**.
- **GIN (Generalized Inverted iNdex)** — Postgres의 인덱스 타입 중 하나. 배열·JSON처럼 값 안에 여러 요소가 있는 컬럼에 적합.
- **KST (Korea Standard Time, 한국 표준시)** — UTC+9.
- **LTS (Long Term Support)** — 장기 지원 버전. Node.js는 짝수 메이저(16, 18, 20, 22)가 LTS.
- **P95 (95th percentile)** — 100회 중 95회가 해당 값 아래로 끝난다는 지연 지표. `with-key` AI 호출은 P95 5초 AC.
- **PII (Personally Identifiable Information, 개인 식별 정보)** — 이름·이메일·전화번호 등 개인을 특정할 수 있는 정보. 로그에 남기지 않는 대상.
- **POC (Proof of Concept, 개념 증명)** — 핵심 가설을 짧은 기간 안에 검증하기 위한 최소 구현.
- **PWA (Progressive Web App)** — 설치형 앱처럼 동작하는 웹앱. 오프라인·알림·홈 화면 아이콘 지원.
- **RLS (Row Level Security, 행 단위 접근 제어)** — Postgres의 행 단위 접근 정책. `with-key`는 전 테이블 ON.
- **Route Handler** — Next.js App Router의 `app/api/*/route.ts` 파일. 이 프로젝트에서는 **외부 콜백 전용**.
- **RSC (React Server Component, 서버 컴포넌트)** — 서버에서 렌더링돼 HTML로 넘어오는 React 컴포넌트. 클라이언트 번들에 포함되지 않음.
- **Server Action** — Next.js가 제공하는 "클라이언트에서 서버 함수를 직접 호출"하는 기능. `'use server'` 지시어로 선언.
- **shadcn/ui** — Tailwind + Radix UI 기반 컴포넌트 레시피 모음. 라이브러리가 아니라 코드를 복사해 넣는 방식.
- **SoT (Source of Truth, 단일 출처)** — 같은 정보를 여러 군데에 두지 않고 한 곳만 진실로 인정하는 원칙.
- **SSR (@supabase/ssr)** — Next.js 서버/클라이언트 양쪽에서 Supabase 세션을 쿠키로 일관되게 유지하는 Supabase 공식 패키지.
- **Turbopack** — Next.js 15+의 기본 번들러. Webpack 후속, Rust 기반으로 빠름.
- **VAPID (Voluntary Application Server Identification)** — Web Push에서 서버가 자신을 증명하는 키 쌍 방식.
- **Web Vitals** — Google이 정의한 사용자 체감 성능 지표(LCP·INP·CLS 등).
- **zod** — TypeScript용 스키마 선언/검증 라이브러리. `with-key`에서는 타입 SoT.
