# ARCHITECTURE.md

`with-key` (윗키) 프로젝트의 아키텍처 레퍼런스. AI 코딩 도구(Claude Code, Cursor)와 개발자가 프로젝트 구조를 이해하기 위해 참조한다.

코딩 품질, 금지 사항, 변경 유형별 검증 기준은 [`QUALITY_GATE.md`](./QUALITY_GATE.md)를 우선한다.

## 프로젝트 개요

**with-key**는 친구 3~4명이 주간 운동 챌린지를 서약서 형태로 약속하고, 사진 + 키워드 칩 원탭으로 인증하면 AI가 운동 일기를 대신 써주는 모바일 웹(PWA) POC다.

- **기간**: POC 2주
- **기술 스택**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui
- **백엔드**: Supabase (Postgres · Auth · Storage) · OpenAI `gpt-4o-mini` · Web Push (VAPID)
- **배포**: Vercel
- **패키지 매니저**: pnpm · Node 20 LTS

## 빌드 환경

- **Node**: 20 LTS (`.nvmrc`로 고정, `engines.node >=20 <21`)
- **pnpm**: 10+ (`packageManager` 필드로 고정)
- **dev 서버**: Turbopack (`next dev` 기본)
- **린터/포맷터**: ESLint (Next flat config) + Prettier
- **테스트**: Vitest (jsdom, util 중심)

품질 게이트의 실행 순서와 추가 검증 조건은 [`QUALITY_GATE.md`](./QUALITY_GATE.md) "테스트와 검증"을 따른다.

## 아키텍처 원칙

### 1. Route Colocation (FSD/bulletproof-react 반려)

Next.js 공식 권장인 **Route colocation + 얇은 공용 `src/lib`** 방식을 채택.

- Feature성 컴포넌트·Server Action은 **해당 route 아래** 에 둔다
  - `app/(app)/<route>/_components/*.tsx`
  - `app/(app)/<route>/_actions.ts`
- 언더스코어(`_`) prefix는 **Next.js 라우팅에서 제외**되는 공식 규약
- 진짜 재사용되는 것만 `src/lib/` (도메인 유틸) + `src/components/ui/` (shadcn primitive)에 둔다
- `src/features/` 폴더는 **두지 않는다**. 화면 수가 30개를 넘으면 점진 승격 검토

**근거**: POC 2주 · 겸임 2인 환경에서 아키텍처 규약 학습 비용을 0에 수렴시키기 위함. FSD의 6계층이나 bulletproof의 `features/` 경계는 과설계로 판단.

### 2. 쓰기는 Server Action으로 통일

- Route Handler(`app/api/*`)는 **외부 콜백 전용**(예: Web Push 콜백)
- 클라이언트 → 서버 쓰기는 **Server Action** (`_actions.ts`)로 일원화
- `useEffect` + `fetch` 금지, RSC + RSC fetch 기본
- SWR · React Query **도입 금지** (POC 범위 초과)

### 3. zod = 타입 Source of Truth

- 도메인 타입은 `src/lib/validators/` zod 스키마에서 `z.infer<>` 로 도출
- DB 타입은 향후 `supabase gen types typescript` → `src/types/supabase.ts`
- `any` 금지, 불가피하면 `unknown` + 좁히기

### 4. RLS는 전 테이블 ON

- Supabase Row Level Security는 예외 없이 전 테이블 활성 (`0002_rls.sql`)
- Storage 사진은 **Pre-signed URL** 만 사용. Public 버킷 금지

## 프로젝트 구조

```
with-key/
├─ AGENTS.md                  ← Next.js 16 공식 안내
├─ README.md                  ← Quick Start
├─ .env.example              ← env 템플릿
├─ .nvmrc                    ← Node 20
├─ components.json           ← shadcn/ui 설정
├─ eslint.config.mjs
├─ middleware.ts             ← Supabase 세션 리프레시 (루트 middleware)
├─ next.config.ts
├─ package.json
├─ pnpm-workspace.yaml
├─ postcss.config.mjs        ← Tailwind v4 (CSS 기반, config 파일 없음)
├─ tsconfig.json
├─ vitest.config.ts
│
├─ public/                   ← (예정) PWA manifest · 아이콘
│
├─ src/
│  ├─ app/                   ← Next.js App Router
│  │  ├─ page.tsx            ← / → /login or /home 서버 리다이렉트
│  │  ├─ layout.tsx · globals.css
│  │  ├─ (auth)/             ← 미인증 전용
│  │  │  ├─ login/page.tsx
│  │  │  └─ invite/[token]/page.tsx
│  │  ├─ (app)/              ← 인증 필요
│  │  │  ├─ home/page.tsx
│  │  │  ├─ feed/page.tsx
│  │  │  ├─ action/page.tsx
│  │  │  ├─ pledge/page.tsx
│  │  │  ├─ recap/page.tsx
│  │  │  └─ settings/page.tsx
│  │  └─ api/
│  │     └─ push/route.ts    ← 외부 콜백 Route Handler만
│  │
│  ├─ components/
│  │  └─ ui/                 ← shadcn primitive
│  │     ├─ button.tsx
│  │     ├─ input.tsx
│  │     ├─ dialog.tsx
│  │     └─ sonner.tsx
│  │
│  └─ lib/
│     ├─ utils.ts            ← shadcn cn() helper
│     ├─ logger.ts           ← JSON-line logger (PII 제외)
│     ├─ supabase/
│     │  ├─ client.ts        ← createBrowserClient
│     │  ├─ server.ts        ← createServerClient (cookies)
│     │  └─ middleware.ts    ← updateSession (세션 가드)
│     ├─ ai/
│     │  ├─ prompts.ts       ← PROMPT_VERSION · system/user 템플릿
│     │  └─ diary.ts         ← OpenAI 호출 + 4.5s 타임아웃 + 키워드 폴백
│     ├─ keywords/
│     │  ├─ pool.ts          ← activityType → 키워드 배열 (PRD §4.6)
│     │  ├─ shuffle.ts       ← 비복원 랜덤 + reroll state (cap 5)
│     │  └─ shuffle.spec.ts
│     ├─ push/
│     │  ├─ vapid.ts         ← VAPID 세팅
│     │  └─ send.ts          ← sendPush + KST Quiet Hours
│     ├─ analytics/
│     │  └─ track.ts         ← AnalyticsEvent 유니온 (PRD §9.1과 1:1)
│     └─ validators/
│        ├─ user.ts
│        ├─ challenge.ts
│        ├─ action-log.ts    ← 키워드 풀 소속 검증
│        └─ kudos.ts
│
├─ supabase/
│  ├─ migrations/
│  │  ├─ 0001_init.sql       ← (BE가 채울 예정) 9개 테이블 스키마
│  │  └─ 0002_rls.sql        ← (BE가 채울 예정) RLS 전 테이블 ON
│  ├─ seed.sql
│  └─ README.md
│
└─ scripts/
   ├─ reset-db.sh
   └─ check-env.ts
```

## 인증 & 세션

- **@supabase/ssr** 기반. `createBrowserClient` / `createServerClient` 두 경로 분리
- 루트 `middleware.ts`가 `updateSession()`을 호출 → 쿠키 리프레시 + 미인증 시 `/login` 리다이렉트
- `/`, `/login`, `/invite/*` 는 가드 예외 처리
- 정적 자산과 이미지 경로는 matcher에서 제외

## 데이터 모델 (PRD §8)

9개 테이블. Day 1에 BE 담당자가 `0001_init.sql`을 채움.

```
users · groups · group_members
challenges · challenge_participants
action_logs · feed_items · kudos
push_subscriptions
```

**핵심 인덱스** (PRD §8.3):
- `challenges(group_id, status)`
- `action_logs(challenge_id, user_id, created_at DESC)`
- `action_logs(user_id, created_at DESC)` — "오늘 인증 여부" 조회
- `action_logs USING GIN (selected_keywords)` — Week 2 키워드 분포 분석
- `kudos(feed_item_id)`

## AI 일기 생성 (`src/lib/ai/`)

PRD §5.3의 AC를 구조로 박았다.

- **입력**: `{ activityType, keywords[1~3], memo?, photoCaption? }`
- **타임아웃**: 4.5초 (P95 5초 AC에 0.5초 버퍼, `AbortController`)
- **키워드 강제**: 응답에 선택 키워드가 모두 포함되지 않으면 `keywordCoverage < 1` 로 판정 → 템플릿 폴백
- **템플릿 폴백**: `templateFallback()`이 동일 키워드를 재사용한 1줄 문구 생성 → 사용자 체감상 실패가 드러나지 않음
- **로그**: 프롬프트/응답 본문은 기록하지 않음. 메타데이터만(`latencyMs`, `fallback`, `keywordCoverage`, `promptVersion`)

## 키워드 풀 (`src/lib/keywords/`)

- `pool.ts`: `activityType → string[]` 하드코딩 (PRD §4.6 v1)
- **POC 기간 중 변경 금지** — 분석 편향 방지. 변경 시 PO 승인 + Validation Plan 재논의
- `shuffle.ts`: 비복원 랜덤 추출, 6~9개 노출. `REROLL_LIMIT = 5`
- 노출 스냅샷은 `action_logs.shown_keywords` 로 서버 전송 → 재현/분석 가능

## 이벤트 로깅 (`src/lib/analytics/track.ts`)

- `AnalyticsEvent` 유니온 타입이 PRD §9.1 이벤트 표와 1:1
- `track(event)` 단일 함수 제공. 임의 이벤트 추가 금지 (PO 승인)
- POC 초기엔 Supabase `events` 테이블 insert로 구현 예정 (현재는 dev console log)
- 서버 이벤트(AI 성공/실패, 알림 발송)도 서버에서 동일 함수 호출

## Web Push

- VAPID 키는 `.env.local`에서 관리 (키 변경 시 전 구독 무효화)
- `lib/push/send.ts`의 `isQuietHoursKST()` 가 새벽 2~7시(KST) 발송 차단
- 구독 정보는 `push_subscriptions` 테이블에 저장

## 빌드 & 배포

### 로컬

```bash
pnpm dev              # Turbopack dev 서버
pnpm build && pnpm start
pnpm lint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest (util 중심)
```

### Vercel

- `main`/`develop` 브랜치를 Vercel에 연결
- PR마다 Preview URL 자동 발급 → 모바일 Safari QA
- env는 Vercel Environment Variables에 저장 (Slack/메신저 공유 금지)

### Supabase

- 로컬: Docker Desktop + `pnpm supabase start` (→ Studio `localhost:54323`)
- 모든 DDL은 `supabase/migrations/*.sql`로만. Studio 직접 수정 금지
- 파일명은 `000X_<snake_case>.sql`. 번호는 맨 뒤에만 추가, 재정렬 금지
- down 스크립트 금지 (POC 단방향)

## 환경 변수

`.env.example`에 전체 목록. 핵심 주의점:

- `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`는 **서버 전용** — `NEXT_PUBLIC_` 접두 금지
- Supabase 키 네이밍: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (클라이언트) / `SUPABASE_SECRET_KEY` (서버). 레거시 `ANON_KEY` / `SERVICE_ROLE_KEY` 명칭은 사용하지 않는다
- `NEXT_PUBLIC_*` 변수는 클라이언트 번들에 포함되므로 민감값 절대 금지
- 프로덕션 secret은 Vercel Environment Variables에만 저장

## 모니터링

- **Vercel Logs** (서버 런타임) + **Vercel Analytics** (Web Vitals)
- Sentry는 **선택** — 프로덕션 예외가 지속 발생하면 도입 (env 추가 + 소스맵 업로드)
- `lib/logger.ts`는 JSON-line 출력, userId만 포함 (이메일/이름 금지)

## 참조 문서

- [`CLAUDE.md`](../CLAUDE.md) — Claude Code 컨텍스트 인덱스 (작업별 진입 문서 매핑)
- [`docs/PRD.md`](./PRD.md) — 기능 스펙 · AC · 이벤트 · 데이터 모델
- [`docs/BE_SCHEMA.md`](./BE_SCHEMA.md) — 테이블 · 제약 · 인덱스 · RLS · 상태 전이 SoT
- [`docs/ONBOARDING.md`](./ONBOARDING.md) — Day 1 실행 가이드
- [`docs/DECISIONS.md`](./DECISIONS.md) — ADR-lite, 되돌리기 비용이 큰 결정 누적
- [`docs/VALIDATION.md`](./VALIDATION.md) — Week 2 GO/NO-GO 지표 · 인터뷰 · 리포트 템플릿
- [`docs/IDEATION.md`](./IDEATION.md) — 제품 "왜" · 페르소나 · 가설
- [`docs/KICKOFF.md`](./KICKOFF.md) — 기술 스택 확정본 (D0 스냅샷, 수정 금지)
- `.claude/drafts/TEAM_SHARE_DESIGN_BRIEF.md` — 9화면 레이아웃 · 컴포넌트 계약 (로컬 전용)
