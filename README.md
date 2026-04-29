# with-key (윗키)

그룹 운동 각서 앱 — 모바일 웹(PWA) POC. 친구 3~4명이 주간 운동 챌린지를 서로 각서 형태로 약속하고, 사진 + 키워드 칩 원탭으로 인증하면 AI가 짧은 운동 일기를 대신 써준다.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** (Postgres · Auth · Storage) via `@supabase/ssr`
- **OpenAI** `gpt-4o-mini` (키워드 기반 일기 생성)
- **Web Push (VAPID)** — PWA 알림
- **Vercel** 배포 · **pnpm** · **Node 20 LTS**

## Quick Start (30분 체크리스트)

```bash
# 1. Node 고정 (nvm 사용 시)
nvm use

# 2. 의존성 설치
pnpm install

# 3. env 복사 + 값 채우기
cp .env.example .env.local
# .env.local을 열어 Supabase / OpenAI / VAPID 키를 채운다

# 4. (선택) 로컬 Supabase 실행 — Docker 필요
pnpm supabase start
pnpm supabase db reset       # migrations + seed

# 5. 개발 서버 (Turbopack)
pnpm dev
# → http://localhost:3000
```

## Scripts

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest 단발 실행 |
| `pnpm test:watch` | Vitest watch |
| `pnpm format` | Prettier 전체 포맷 |

## 구조

```
src/
├─ app/                ← Next.js App Router
│  ├─ (auth)/          ← 로그인 · 초대 (미인증 전용)
│  ├─ (app)/           ← 인증 필요 화면 (home · feed · action · pledge · recap · settings)
│  │   └─ <route>/_components, _actions.ts  ← route-colocated
│  └─ api/push/        ← 외부 콜백만 Route Handler
├─ components/ui/      ← shadcn primitive
└─ lib/
   ├─ supabase/        ← client · server · middleware
   ├─ ai/              ← prompts · diary (OpenAI + 키워드 폴백)
   ├─ keywords/        ← pool(하드코딩) · shuffle(비복원 랜덤)
   ├─ push/            ← VAPID · send
   ├─ analytics/       ← track (PRD §9.1과 1:1)
   ├─ validators/      ← zod 스키마 = 타입 SoT
   └─ utils.ts
```

**원칙**: feature성 컴포넌트는 해당 route의 `_components/`에 colocate. `src/features/`는 두지 않는다. 자세한 규칙은 팀 내부 `ONBOARDING` 문서 참조.

## 문서

| 문서 | 역할 |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 스택 · 구조 · 원칙 (Route colocation · zod SoT · RLS) |
| [`docs/PRD.md`](./docs/PRD.md) | 유저 스토리 · AC · 데이터 모델 · 이벤트 스키마 |
| [`docs/BE_SCHEMA.md`](./docs/BE_SCHEMA.md) | 테이블 · 제약 · 인덱스 · RLS · 상태 전이 SoT |
| [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) | Day 1 세팅 · 개발 규칙 · 배포 |
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | ADR-lite — 되돌리기 비용이 큰 결정 누적 |
| [`docs/VALIDATION.md`](./docs/VALIDATION.md) | Week 2 GO/NO-GO 지표 · 인터뷰 · 리포트 템플릿 |
| [`docs/IDEATION.md`](./docs/IDEATION.md) | 제품 "왜" · 페르소나 · 가설 |
| [`docs/KICKOFF.md`](./docs/KICKOFF.md) | D0 스냅샷 (수정 금지) |

Design Brief · 킥오프 안건 · 일일 로그는 `.claude/drafts/`에 로컬 보관.
