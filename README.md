# FROMWITH

> from. with — 친구와 함께하는 운동 서약서

그룹 운동 **서약서** 앱 — 모바일 웹(PWA) POC. 친구 3~4명이 주간 운동 챌린지를 서약서 형태로 약속하고, 키워드 칩 원탭으로 인증하면 AI가 짧은 운동 일기를 대신 써준다. 실패 시 정산은 카카오페이 송금 링크 + QR로 처리한다.

## Stack

- **Next.js 16** (App Router · Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitive 포함)
- **Supabase** (Postgres · Auth · Storage) via `@supabase/ssr` — RLS 전 테이블 ON
- **OpenAI** `gpt-4o-mini` — 키워드 기반 일기 생성 + 템플릿 폴백
- **Web Push (VAPID)** — PWA 알림
- **KakaoPay 송금 링크** — 정산 (실결제 API 연동 없음, D-009)
- **Vercel** 배포 · **pnpm 10** · **Node 20 LTS**

## Quick Start

```bash
# 1. Node 고정 (nvm 사용 시)
nvm use

# 2. 의존성 설치
pnpm install

# 3. env 복사 + 값 채우기
cp .env.example .env.local
# .env.local을 열어 Supabase / OpenAI / VAPID / KakaoPay 링크를 채운다

# 4. 원격 dev Supabase 프로젝트 연결 (최초 1회)
pnpm supabase link --project-ref <project-ref>
pnpm db:push                 # migrations 적용
pnpm db:types                # src/types/supabase.ts 재생성

# 5. 개발 서버 (Turbopack)
pnpm dev
# → http://localhost:3000
```

### 인증 (로컬 dev)

**Magic Link** (Supabase email OTP) 기본. `DEV_BYPASS_AUTH` 는 사용하지 않는다 ([D-011](./docs/TEAM_SHARE_DECISIONS.md)).

```
/login → 이메일 입력 → 수신 링크 클릭 → /auth/callback → /home
```

RLS 검증은 `tests/integration/` 의 `asUser()` 헬퍼가 실제 Supabase 세션으로 수행한다.

## Scripts

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit (jsdom/node 자동 분기) |
| `pnpm test:integration` | Vitest integration (실 Supabase · 단일 fork · 직렬) |
| `pnpm test:watch` | Vitest watch |
| `pnpm format` | Prettier 전체 포맷 |
| `pnpm format:check` | Prettier 검사만 |
| `pnpm db:push` | `supabase db push --linked` |
| `pnpm db:diff` | 로컬↔원격 스키마 diff |
| `pnpm db:types` | `src/types/supabase.ts` 재생성 |

## 구조

```
src/
├─ app/                       ← Next.js App Router
│  ├─ (auth)/                 ← 미인증 전용
│  │  ├─ login/               ← Magic Link 입력 + _actions.ts
│  │  └─ invite/[token]/
│  ├─ auth/callback/          ← OAuth/OTP 콜백 (Route Handler)
│  ├─ (app)/                  ← 인증 필요 (BottomNav 3탭 쉘)
│  │  ├─ home/                ← 오늘의 서약/인증 요약
│  │  ├─ feed/                ← 그룹 피드 + Kudos
│  │  ├─ action/              ← 키워드 칩 인증 + 리롤(≤5) + memo escape
│  │  ├─ pledge/              ← 서약서 서명 (sign_and_activate RPC)
│  │  ├─ challenge/new/       ← 서약서 생성
│  │  ├─ challenge/[id]/      ← 상태 보드 + 정산 시트(QR/링크)
│  │  ├─ recap/               ← Week 2 요약
│  │  └─ settings/            ← 2-toggle settings
│  │      └─ <route>/_components, _actions.ts  ← route-colocated
│  └─ api/push/               ← 외부 콜백 전용 Route Handler
│
├─ components/
│  ├─ ui/                     ← shadcn primitive
│  └─ app-shell/              ← BottomNav 등 공용 쉘
│
└─ lib/
   ├─ supabase/               ← client · server · middleware
   ├─ db/reads/               ← BFF Read 레이어 (D-013)
   │                           active-challenge · challenge-detail · pledge
   ├─ actions/                ← ActionResult · error-messages · supabase-error
   │                           6-code error taxonomy (D-012)
   ├─ auth/                   ← with-user (세션 가드 헬퍼)
   ├─ ai/                     ← prompts(PROMPT_VERSION) · diary(OpenAI + 폴백)
   ├─ keywords/               ← pool(하드코딩) · shuffle(비복원 랜덤)
   ├─ challenge/              ← duration · penalty 도메인 유틸
   ├─ kakaopay/               ← 송금 링크 빌더 (host allowlist)
   ├─ push/                   ← VAPID · send (KST Quiet Hours)
   ├─ analytics/              ← track (PRD §9.1과 1:1)
   ├─ validators/             ← zod 스키마 = 타입 SoT
   ├─ logger.ts
   └─ utils.ts

supabase/migrations/          ← 0001_init ~ 0006_rpc_activate_via_definer
tests/integration/            ← harness + factories + reads/actions (실 DB)
scripts/                      ← check-env.ts · reset-db.sh
```

**원칙**: feature성 컴포넌트·Server Action은 해당 route의 `_components/`, `_actions.ts` 에 colocate. `src/features/` 는 두지 않는다. Route Handler는 외부 콜백 전용이며 클라이언트→서버 쓰기는 Server Action으로 통일한다. 자세한 규칙은 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 참조.

## 테스트 전략

- **Unit** (`src/**/*.{spec,test}.{ts,tsx}`) — jsdom/node 자동 분기 (`_components/**` 는 jsdom, 나머지는 node)
- **Integration** (`tests/integration/**`) — 원격 dev Supabase 에 붙어 RLS/RPC/유니크 제약까지 검증. `asUser()` 로 사용자 스코프 세션을 발급하고 `truncate_test_data` 로 `@test.local` 도메인만 정리.

## 문서

| 문서 | 역할 |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 스택 · 구조 · 원칙 (Route colocation · zod SoT · RLS · BFF reads) |
| [`docs/PRD.md`](./docs/PRD.md) | 유저 스토리 · AC · 데이터 모델 · 이벤트 스키마 |
| [`docs/BE_SCHEMA.md`](./docs/BE_SCHEMA.md) | 테이블 · 제약 · 인덱스 · 상태 전이 SoT |
| [`docs/BE_SCHEMA_RLS.md`](./docs/BE_SCHEMA_RLS.md) | RLS policy 계약 — predicate · 인덱스 요구 |
| [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) | Day 1 세팅 · 개발 규칙 · 배포 |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | ADR-lite (skill 관리) |
| [`docs/TEAM_SHARE_DECISIONS.md`](./docs/TEAM_SHARE_DECISIONS.md) | 팀 공유 결정 로그 (되돌릴 조건 명시) |
| [`docs/VALIDATION.md`](./docs/VALIDATION.md) | Week 2 GO/NO-GO 지표 · 인터뷰 · 리포트 템플릿 |
| [`docs/IDEATION.md`](./docs/IDEATION.md) | 제품 "왜" · 페르소나 · 가설 |
| [`docs/KICKOFF.md`](./docs/KICKOFF.md) | D0 스냅샷 (수정 금지) |

Design Brief · 킥오프 안건 · 일일 로그는 `.claude/drafts/` 에 로컬 보관.
