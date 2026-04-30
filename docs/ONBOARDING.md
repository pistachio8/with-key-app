# 🛠️ [Codename: with-key] — POC Engineering Onboarding

> **문서 상태**: Draft v0.1 · **작성자**: Ian (Product Owner) · **작성일**: 2026-04-24
> **대상 독자**: FE / BE 개발자 (POC 참여자 전원)
> **Pre-read**:
> - [IDEATION.md](./IDEATION.md) v0.8 — **왜** 만드는가
> - [PRD.md](./PRD.md) v0.1 — **무엇을** 만드는가 (§8 데이터 모델 · §9 이벤트 필수)
> - [TEAM_SHARE_DESIGN_BRIEF.md](../.claude/drafts/TEAM_SHARE_DESIGN_BRIEF.md) v0.1 — **어떻게 보일 것인가** (§5 컴포넌트 명명 계약, 로컬 전용)
>
> **이 문서의 역할**: 개발자 Day 1에 **"clone → 로컬 실행 → 첫 커밋"** 을 1시간 안에 끝낼 수 있는 실전 가이드.

---

## 0. 중요 가정 (킥오프 이후 치환)

이 문서는 아래 **기술 스택 가정** 하에 작성되었습니다. 킥오프에서 달라지면 **§0 체크리스트** 기준으로 본문을 수정합니다.

| 영역 | 가정 | 대안 | 변경 시 수정 섹션 |
|---|---|---|---|
| 프레임워크 | **Next.js 16 (App Router) + TypeScript** | Remix / Vite+React | §2, §4, §5 |
| DB & Auth | **Supabase (Postgres + Auth + Storage)** | Firebase / PlanetScale + NextAuth | §4, §6, §7 |
| 스타일 | **Tailwind CSS v4** | CSS Modules / styled-components | §2, §9 |
| 호스팅 | **Vercel** | Cloudflare Pages / Netlify | §8 |
| AI | **OpenAI 4o-mini** | Anthropic / Google | §4, §6 |
| 푸시 | **Web Push (VAPID)** + 옵션으로 알림톡 | OneSignal | §6 |
| 모니터링 | **Vercel Analytics + Logs** | Sentry 무료 플랜 | §10 |
| 패키지 매니저 | **pnpm** | npm / yarn | §3 |
| Node 버전 | **20 LTS** | - | §3 |

---

## 1. 프로젝트 한 눈에 보기

| 항목 | 값 |
|---|---|
| 프로젝트 | [Codename: with-key] (윗키) — 그룹 운동 서약서 앱 |
| 기간 | POC 2주 |
| 배포 대상 | 모바일 웹 (PWA) |
| 팀 규모 | FE/BE 2 (쟁·뜌 겸임) · 디자이너 1 (뜌) · PO 1 (쟁) · 법무 1 (샤쌤) · 리서치 1 (순진) |
| 저장소 | `github.com/<org>/with-key` — **킥오프 후 확정 (URL 미정)** |
| 코드 리뷰 | PR 1명 이상 approve 필요. PO는 리뷰 옵션. |
| 기본 브랜치 | `main` (보호됨) |
| 스프린트 단위 | 1주 |

---

## 2. 저장소 구조 (제안)

> **단일 Next.js 앱**. 모노레포/마이크로서비스는 POC 범위 초과.

```text
with-key/
├─ README.md                  ← 이 문서 요약본
├─ AGENTS.md                  ← Next.js 16 공식 안내 (코드 작성 전 docs 읽기)
├─ .env.example              ← env 변수 템플릿 (§7)
├─ .env.local                ← 개인 로컬용 (gitignore)
├─ .nvmrc                    ← Node 20
├─ .prettierrc / .prettierignore
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.mjs        ← Tailwind v4 (CSS 기반, config 파일 없음)
├─ tsconfig.json
├─ vitest.config.ts
├─ components.json           ← shadcn/ui 설정
├─ middleware.ts              ← Supabase 세션 리프레시
│
├─ public/
│  ├─ manifest.json           ← PWA manifest
│  └─ icons/                  ← 아이콘 (디자이너 산출물)
│
├─ src/
│  ├─ app/                    ← Next.js App Router (RSC 기본)
│  │  ├─ page.tsx             ← / → /login or /home 리다이렉트
│  │  ├─ layout.tsx · globals.css
│  │  ├─ (auth)/              ← 로그인/온보딩 (미인증 전용)
│  │  │  ├─ login/page.tsx
│  │  │  └─ invite/[token]/page.tsx
│  │  ├─ (app)/               ← 인증 필요 화면 · feature 컴포넌트는 _components/에 colocate
│  │  │  ├─ home/page.tsx
│  │  │  ├─ feed/             page.tsx + _components/FeedCard.tsx + _actions.ts
│  │  │  ├─ action/           page.tsx + _components/KeywordChips.tsx + _actions.ts
│  │  │  ├─ pledge/           page.tsx + _components/ + _actions.ts
│  │  │  ├─ recap/page.tsx
│  │  │  └─ settings/         page.tsx + _actions.ts
│  │  └─ api/                 ← 외부 콜백 Route Handler만 (쓰기는 Server Action 통일)
│  │     └─ push/route.ts
│  │
│  ├─ components/
│  │  └─ ui/                  ← shadcn/ui primitive (Button/Input/Dialog/Sonner ...)
│  │
│  ├─ lib/
│  │  ├─ utils.ts             ← shadcn cn() helper
│  │  ├─ logger.ts
│  │  ├─ supabase/
│  │  │  ├─ client.ts         ← createBrowserClient
│  │  │  ├─ server.ts         ← createServerClient (cookies)
│  │  │  └─ middleware.ts     ← updateSession
│  │  ├─ ai/
│  │  │  ├─ diary.ts          ← AI 호출 + 키워드 활용 템플릿 폴백
│  │  │  └─ prompts.ts        ← PROMPT_VERSION + system/user 템플릿
│  │  ├─ keywords/
│  │  │  ├─ pool.ts           ← activityType → string[] (PRD §4.6)
│  │  │  └─ shuffle.ts        ← 비복원 랜덤, reroll state
│  │  ├─ push/{vapid,send}.ts ← Web Push 헬퍼 + Quiet Hours 판정
│  │  ├─ analytics/track.ts   ← 단일 함수, AnalyticsEvent 유니온 (§9 PRD)
│  │  └─ validators/          ← zod 스키마 = 타입 SoT
│  │     ├─ user.ts · challenge.ts · action-log.ts · kudos.ts
│  │
│  ├─ types/                  ← supabase gen types + 도메인 별칭
│  └─ utils/                  ← 순수 util (필요 시만 — YAGNI)
│
├─ supabase/
│  ├─ migrations/             ← SQL 마이그레이션 (§4.3)
│  │  ├─ 0001_init.sql
│  │  └─ 0002_rls.sql
│  ├─ seed.sql                ← 테스트 데이터
│  └─ README.md
│
├─ scripts/
│  ├─ reset-db.sh             ← 로컬 DB 초기화
│  └─ check-env.ts            ← env 검증
│
└─ docs/                      ← 팀 내부 문서 (IDEATION · PRD 등을 복사)
```

### 2.1 폴더 네이밍 규칙

- **파일**: `kebab-case.ts` (컴포넌트는 `PascalCase.tsx`)
- **폴더**: `kebab-case`
- **컴포넌트 export**: `PascalCase` default or named 일관성 유지 (**named 권장**)
- **Route Handler**: `route.ts` 하나만 (Next.js 규칙)
- **Feature 컴포넌트는 route colocation**: `app/(app)/<route>/_components/`, Server Action은 `_actions.ts`에. `src/features/`는 두지 않는다. (언더스코어 prefix = Next.js 라우팅 제외 공식 규약)

---

## 3. 사전 준비 (Prerequisites)

### 3.1 개발 머신

- macOS 12+ / Windows 11 (WSL2) / Ubuntu 22+
- **Node 20 LTS** (`.nvmrc` 로 고정)
- **pnpm 9+** (`corepack enable`)
- **Docker Desktop** (로컬 Supabase 실행)
- **Git 2.40+**

### 3.2 계정/권한 (킥오프 당일 발급 요청)

- [ ] GitHub 저장소 write 권한
- [ ] Vercel 팀 초대
- [ ] Supabase 프로젝트 초대
- [ ] Sentry 프로젝트 초대 (선택 — 킥오프에서 Vercel 모니터링으로 확정, 필요 시 추가)
- [ ] OpenAI API 키는 **서버에만** — 개인 기기 공유 금지. 로컬 개발은 **개인 키 + 월 $5 한도**.

### 3.3 에디터 권장

- VSCode / Cursor
- 확장: **ESLint**, **Prettier**, **Tailwind CSS IntelliSense**, **Supabase**
- 공통 설정은 `.vscode/settings.json` 에 커밋

---

## 4. 로컬 실행 — 30분 체크리스트

> 목표: clone → `pnpm dev` → `http://localhost:3000` 홈 화면 확인.

```bash
# 1. clone
git clone git@github.com:<org>/with-key.git
cd with-key

# 2. Node 고정 (nvm 사용 시)
nvm use

# 3. 의존성 설치
pnpm install

# 4. env 복사 + 값 채우기
cp .env.example .env.local
# 에디터로 .env.local 열어 §7 환경변수 채움

# 5. 로컬 Supabase 실행 (Docker 필요)
pnpm supabase start
# → API URL, anon key 출력 → .env.local에 반영

# 6. 마이그레이션 적용 + 시드
pnpm supabase db reset

# 7. 개발 서버
pnpm dev

# 8. 브라우저
# → http://localhost:3000
# → 모바일 Safari 확인: ngrok http 3000 (PWA 테스트)
```

### 4.1 첫 실행 체크리스트

- [ ] 홈 화면 로딩
- [ ] 시드 데이터의 테스트 유저로 로그인 성공
- [ ] Supabase Studio (`http://localhost:54323`) 에서 테이블 확인
- [ ] DevTools → Application → Service Worker 등록 확인 (PWA)

### 4.2 자주 쓰는 명령

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build && pnpm start` | 프로덕션 빌드 로컬 확인 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TSC no-emit |
| `pnpm test` | Vitest (있다면) |
| `pnpm supabase db reset` | DB 초기화 + 마이그레이션 + 시드 |
| `pnpm supabase migration new <name>` | 새 마이그레이션 파일 |
| `pnpm supabase db diff` | 로컬 DB 변경사항 SQL 추출 |

### 4.3 DB 마이그레이션 원칙

- **모든 DDL 변경은 마이그레이션 파일로** 추적. Studio에서 직접 수정 금지.
- 파일명: `000X_<snake_case>.sql` — 번호는 PR 머지 시점 기준으로 쉬프트하지 말고 **맨 뒤 번호 추가**.
- **Row Level Security (RLS)** 는 별도 마이그레이션으로 분리 (`0002_rls.sql`).
- 되돌리기는 **앞으로 가는 마이그레이션** 으로만 (down 스크립트 금지 — POC는 단방향).

---

## 5. 아키텍처 · 설계 규칙

### 5.1 레이어 분리

```text
[Client Component]  ← 'use client'
    │
    ↓ fetch / Server Action
[Route Handler / Server Action]
    │
    ├─→ [Validator (zod)]
    ├─→ [Supabase client (RLS)]
    ├─→ [Domain Service]  ← lib/ai, lib/push 등
    └─→ [Analytics]       ← lib/analytics
```

### 5.2 "그 로직, 어디에?"

| 로직 | 위치 |
|---|---|
| UI 상태, 인터랙션 | Client Component (`use*`) |
| 인증 필요한 데이터 조회 | Server Component (기본) |
| 쓰기 / 부수효과 | **Route Handler** 또는 **Server Action** (둘 중 1개로 통일 — PO 추천: **Server Action**) |
| 외부 API 호출 (OpenAI 등) | 서버 전용 (`lib/ai/`) — 클라이언트 노출 절대 금지 |
| 권한 체크 | Supabase **RLS 우선** + Server 레이어 2차 방어 |

### 5.3 데이터 페칭 규칙

- **기본은 Server Component + RSC fetch**. useEffect+fetch 금지.
- 실시간 필요한 화면 (Kudos 카운트)만 Supabase Realtime 또는 3초 polling.
- SWR / React Query **도입 금지** (POC 범위 초과).

### 5.4 타입 정책

- **zod 스키마 = 소스 오브 트루스**. TS 타입은 `z.infer<>` 로 도출.
- DB 스키마는 `supabase gen types typescript` 로 생성 — `types/supabase.ts`.
- `any` 금지. 불가피하면 `unknown` + 좁히기.

### 5.5 코딩 스타일

- **ESLint + Prettier 자동 포맷**. 커밋 훅 (husky + lint-staged) 강제.
- 명시적 import 순서: `react → next → 외부 lib → @/* → 상대경로`.
- 파일당 default export 1개 or 전부 named (혼용 금지).
- 주석: **왜** 만 남김. **무엇** 은 코드로 말함.
- 한국어 문자열은 UI 표시용만. 코드/로그는 영어.

---

## 6. 핵심 통합 포인트

### 6.1 Supabase

- 클라이언트는 2종류 분리 필수:
  - `lib/supabase/client.ts` — 브라우저용 (`createBrowserClient`)
  - `lib/supabase/server.ts` — 서버용 (`createServerClient` with cookies)
- RLS는 **전 테이블 ON**. 예외 없음.
- Storage 사진: **Pre-signed URL** 만 사용. Public 버킷 금지.

### 6.2 OpenAI (AI 일기)

- 모델: `gpt-4o-mini` (비용 · 지연 균형)
- 타임아웃: **4.5초** (PRD §5.3 AC-4의 5초 P95보다 버퍼).
- **입력 구조 (PRD §5.2, §5.6)**
  ```ts
  type DiaryPromptInput = {
    activityType: 'running' | 'gym' | 'yoga' | 'other';
    keywords: string[];   // 1~3, 필수
    memo?: string;        // 선택 (escape hatch)
    photoCaption?: string; // 선택
  };
  ```
- **출력 제약**: 3~5줄 · 150자 이하 · 존댓말 · `keywords` 각각 1회 이상 포함. 누락 시 1회 self-retry 후 키워드 활용 템플릿 폴백.
- **템플릿 폴백 (PRD §5.3 AC-8)** — AI 실패 시에도 사용자에게는 자연스럽게 보이도록 `keywords`를 반드시 포함:
  ```
  {name}님, 오늘 {activityTypeKo}에서 {kw1} · {kw2} 🔥 수고하셨어요!
  ```
- **월 예산 한도** (킥오프에서 확정):
  - 월 누적 비용 추적 table: `ai_cost_log(month, total_cents)`
  - 한도 초과 시 `lib/ai/diary.ts` 에서 **자동 템플릿 폴백** (키워드 그대로 활용).
- 프롬프트는 `lib/ai/prompts.ts` 하나에 모음 (버전 관리 쉽게). 변경 시 `PROMPT_VERSION` 상수 bump → `ai_generated` 이벤트에 기록.
- **로그 규칙**: 프롬프트 · 응답 본문 로깅 금지 (프라이버시). 메타데이터(토큰 수 · 지연 · **keywordCoverage** · fallback 여부 · promptVersion)만.

### 6.3 키워드 풀 (`lib/keywords/`)

- `pool.ts`: `activityType → string[]` 하드코딩 (PRD §4.6 초안). POC 기간 중 **수정 금지** (분석 편향 방지). 변경 시 PO 승인 + Validation Plan 재논의.
- `shuffle.ts`: 클라이언트에서 돌리되 **비복원 랜덤**. 노출 칩 배열을 `action_logs.shown_keywords` 로 서버 전송해 **재현/분석** 가능하게 한다.
- 다시 뽑기 제한 = **5회/인증** (PRD §4.3 AC-9). 카운트는 클라이언트 상태 + 서버 `reroll_count` 검증 이중.

### 6.4 Web Push

- VAPID 키는 env 관리 (§7). 키 변경 시 전 구독 무효화됨.
- 구독 정보는 `push_subscriptions` table (PRD §8.1).
- Quiet Hours (02~07시) 판정은 **서버 타임(KST)** 기준.

### 6.5 이벤트 로깅 (§9 PRD)

- `lib/analytics/track.ts` 에 단일 함수 `track(event, props)` 제공.
- 구현: POC 초기 Supabase `events` table 직접 insert.
- 이벤트 이름은 **PRD §9.1 표와 1:1**. 임의 추가 금지 (PO 승인).
- 서버 이벤트 (AI 성공/실패, 알림 발송)도 **서버에서 track** 호출.

---

## 7. 환경변수 (`.env.local` 레퍼런스)

> `.env.example` 은 **항상 최신 상태 유지**. 변수 추가 시 PR에 포함.

```bash
# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_CODENAME=TBD

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=             # 서버 전용 — sb_secret_* 형식 (레거시 SERVICE_ROLE_KEY 대체)

# --- OpenAI ---
OPENAI_API_KEY=                   # 서버 전용
OPENAI_MODEL=gpt-4o-mini
AI_MONTHLY_BUDGET_KRW=50000       # 킥오프 결정값

# --- Kakao OAuth (옵션) ---
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=

# --- Web Push (VAPID) ---
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=                # 서버 전용
VAPID_SUBJECT=mailto:ian@example.com

# --- Sentry (옵션 — 킥오프 기본 off, §10.3 참조) ---
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                # 빌드 시 소스맵 업로드용

# --- Feature Flags ---
FEATURE_ALIMTALK=false            # 알림톡은 POC 기본 off
```

### 7.1 Secret 관리 원칙

- `.env.local` 은 **절대 커밋 금지** (gitignore 확인).
- 프로덕션 secret은 **Vercel Environment Variables** 에만 저장.
- Slack/메신저에 키 붙여넣기 금지. 1Password / Bitwarden 공유.
- `NEXT_PUBLIC_` 접두가 붙으면 **번들에 포함** → 민감값 절대 금지.

---

## 8. 브랜치 · 배포 · 릴리즈

### 8.1 브랜치 전략 (POC 경량)

```text
main (보호됨, Vercel Production)
  ↑ PR merge
feat/<scope>-<short-desc>
fix/<scope>-<short-desc>
chore/<desc>
```

- `develop` 브랜치 **없음**. Trunk-based.
- 브랜치 수명: **최대 2일**. 길어지면 분할.
- PR은 **작게 자주**. 300줄 초과 시 분할 요청 가능.

### 8.2 커밋 메시지 (Conventional Commits 경량)

```text
feat: 인증 제출 시 AI 일기 자동 생성
fix: 초대 링크 만료 시 500 에러 수정
chore: pnpm-lock 갱신
docs: ONBOARDING에 env 변수 추가
```

- 한국어 OK. 타입(`feat/fix/chore/docs/refactor/test`)은 영어.
- scope는 선택 (`feat(feed): ...`).

### 8.3 PR 체크리스트 (템플릿)

```md
## 무엇을 바꿨나
- (요약)

## 왜
- IDEATION/PRD/Issue 링크

## 어떻게 테스트했나
- [ ] 로컬에서 확인
- [ ] AC(PRD §X.Y) 만족

## 영향 범위
- [ ] DB 마이그레이션 있음 → rollback 계획 기재
- [ ] 환경변수 추가 → `.env.example` 업데이트
- [ ] 새 이벤트 추적 → PRD §9 업데이트

## 스크린샷 / 영상
(모바일 스크린샷 필수)
```

### 8.4 CI (GitHub Actions 최소 세트)

- PR 열릴 때: `lint` → `typecheck` → `build` (모두 통과 필수)
- 테스트: POC는 **핵심 유닛만** (lib/ai 폴백 로직 · validators). E2E 없음.
- Preview 배포: Vercel이 PR마다 자동 URL 발급 → 모바일에서 QA.

### 8.5 배포 흐름

```text
feat/* → PR → review + CI green → squash merge → main
                                                   │
                                                   ↓
                                      Vercel Production 자동 배포
                                                   │
                                                   ↓
                                    Supabase migration 수동 apply*
```

*Supabase migration은 수동 apply (CI에서 자동화는 POC 이후).

### 8.6 롤백

- 앱: Vercel 대시보드 → 이전 배포 "Promote to Production" (1분).
- DB: **앞으로 가는 새 마이그레이션** 작성. `down` 없음.
- 긴급 시 feature flag (§7 env) off → 재배포.

---

## 9. UI 개발 규칙

### 9.1 디자인 동기화

- Figma 컴포넌트 이름 = 코드 컴포넌트 이름 (Design Brief §5.1 계약).
- Design Tokens (color, spacing, radius) 는 `tailwind.config.ts` 에 일원화. 하드코딩 금지.
- 새 화면 작업 전 **Figma 최신 프레임 확인** 필수.

### 9.2 반응형

- 모바일 360~430 폭 **필수 테스트**. iPhone SE(360), iPhone 13(390), Pro Max(430).
- 데스크탑은 **"깨지지 않음"** 수준. max-width 센터링.

### 9.3 PWA

- `manifest.json` + service worker. Next.js는 `next-pwa` 또는 커스텀 SW.
- 오프라인 폴백: POC는 "네트워크 필요" 페이지 하나만.
- 홈 화면 추가 프롬프트는 **시작 탭 1회 후** 노출 (과도한 권한 유도 금지).

### 9.4 접근성 최소 기준 (CI로 체크는 POC 이후)

- 모든 이미지 `alt` 필수
- 버튼은 `<button>`, 링크는 `<a>` — 시맨틱 유지
- 포커스 outline 제거 금지
- 색 대비 4.5:1 (디자인 토큰이 보장)

---

## 10. 로깅 · 모니터링 · 디버깅

> 킥오프 확정: 모니터링은 **Vercel** (Logs · Analytics · Web Vitals). Sentry는 필요 시 추가.

### 10.1 로깅 레벨

| 레벨 | 용도 | 예 |
|---|---|---|
| `error` | 처리 실패, 재시도 불가 | AI API 타임아웃 |
| `warn` | 비정상이나 폴백 동작 | AI 폴백 적용, quiet hour 큐잉 |
| `info` | 주요 도메인 이벤트 | challenge_activated |
| `debug` | 개발 중 (프로덕션 꺼짐) | - |

- `console.log` **금지**. `lib/logger.ts` 사용 (환경별 포맷/레벨 분기 + 추후 Sentry breadcrumb 연동 여지).
- 사용자 PII (이메일/이름) 로그 **포함 금지**. userId만.

### 10.2 Vercel 기반 모니터링 (기본)

- **Vercel Logs**: 서버 런타임 로그 (Route Handler · Server Action). Pro 플랜 미만이면 최근 1시간만 보관 → 중요한 에러는 `events` 테이블에도 동시 기록.
- **Vercel Analytics**: 페이지뷰 · Web Vitals. `@vercel/analytics`를 `<Analytics />`로 루트 레이아웃에 마운트.
- **Speed Insights**: 선택 — 모바일 체감 지표 (LCP/INP) 추적이 필요해지면 활성화.
- 대시보드 링크는 Slack `#poc-dev`에 고정 메시지로 공유.

### 10.3 Sentry (선택 · 도입 시점 판단)

- 킥오프 기본 off. 다음 중 하나면 도입:
  - Vercel Logs 만으로 에러 재현이 어렵다 (스택트레이스/breadcrumb 필요)
  - 프로덕션 예외 3건/일 이상 지속
- 도입 시 env(`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`) 추가 + 소스맵 업로드 (prod).

### 10.4 디버깅 도구

- Supabase Studio: 로컬 http://localhost:54323 / prod은 대시보드
- Vercel Logs: 서버 런타임 로그
- Chrome DevTools **Remote Debugging** (iOS Safari Inspector) — 모바일 이슈 시

---

## 11. 테스트 전략 (POC 최소)

> POC는 **"사용자 인터뷰로 검증"** 이 주. 자동 테스트는 **핵심 리스크만**.

| 레벨 | 대상 | 툴 | POC 범위 |
|---|---|---|---|
| **유닛** | `lib/ai/diary.ts` 폴백 · `lib/keywords/shuffle.ts` (비복원/재추첨 정확성) · `lib/validators/*` | Vitest | **권장** |
| **통합** | Route Handler × DB | Vitest + Supabase local | 선택 |
| **E2E** | 주요 flow | Playwright | **POC 제외** |
| **수동 QA** | 모든 화면 × 상태 | 체크리스트 (PRD §7 상태변이) | **필수** |

### 11.1 수동 QA 체크리스트 (Day 10 Dogfooding 직전)

- [ ] Happy path (PRD §11.1) E2E 1회 (Ian)
- [ ] 실패 path (§11.2) 1회
- [ ] 알림 수신 — 실기기 2대 (iOS + Android)
- [ ] PWA 설치 플로우 확인
- [ ] Sentry 에러 최근 24h 0건

---

## 12. 보안 · 프라이버시 체크리스트

> POC 출시 전 **반드시** 통과.

- [ ] RLS 모든 테이블 ON + 테스트 (다른 그룹 데이터 접근 불가)
- [ ] Service Role Key 는 서버 코드에서만 참조
- [ ] Pre-signed URL 만 사용, Public 버킷 없음
- [ ] CSP 헤더 기본값 적용 (`next.config` 에)
- [ ] XSS: 사용자 입력은 React 기본 이스케이프 + `dangerouslySetInnerHTML` 사용 금지
- [ ] 사진 업로드 MIME 서버 검증
- [ ] 로그인 실패 시 타이밍 공격 방지 (일관된 응답)
- [ ] 탈퇴 요청 시 30일 내 삭제 루틴 (현재는 **수동** — 요청 시 PO가 처리, v1 자동화)

---

## 13. 흔한 문제 & 해결 (Troubleshooting)

| 증상 | 원인 | 해결 |
|---|---|---|
| `pnpm dev` 에서 Supabase 연결 실패 | `supabase start` 미실행 or Docker 꺼짐 | Docker 실행 → `pnpm supabase start` |
| 로그인 후 쿠키 안 잡힘 | `middleware.ts` 누락/오류 | 세션 리프레시 미들웨어 확인 |
| RSC에서 `supabase` 가 `undefined` | client용을 서버에서 import | `lib/supabase/server.ts` 로 교체 |
| OpenAI 429 | 개인 키 rate limit | 조직 키로 교체 or 지수 백오프 |
| PWA 아이콘 깨짐 | `manifest.json` 경로 오류 or 캐시 | Service Worker unregister → 새로고침 |
| Vercel 빌드 OOM | Next.js 이미지 처리 | `next.config` `images.unoptimized` 점검 |
| 푸시 권한은 허용인데 안 옴 | VAPID 키 불일치 / 구독 만료 | DB의 구독 삭제 → 재구독 유도 |

---

## 14. 타임라인 · 담당 (POC 2주)

> 담당자 매핑 ([KICKOFF.md](./KICKOFF.md) §2.6): FE/BE = **쟁뜌(겸임)** · 디자인 = **뜌** · PO·AI 일기 = **쟁** · 법무 = **샤쌤** · 리서치/모집 = **순진**.

### Week 1

| Day | FE/BE (쟁뜌) — 프론트 트랙 | FE/BE (쟁뜌) — 백엔드 트랙 | 디자인 (뜌) | PO (쟁) |
|---|---|---|---|---|
| 1 | 저장소 세팅 · 토큰 · 라우팅 | Supabase schema · RLS · Auth | 토큰 · 컴포넌트 12개 | 킥오프 후속 · PRD 최종화 |
| 2 | 화면 1·2·3 뼈대 | 초대 링크 · 그룹 생성 API | 화면 1~3 high-fi | 테스트 그룹 커뮤니케이션 (순진 협업) |
| 3 | 화면 4·5 뼈대 | 인증 API · 사진 업로드 | 화면 4~6 high-fi | 이벤트 스키마 검토 |
| 4 | 화면 6 피드 · Kudos | AI 일기 (키워드 프롬프트) · 키워드 활용 폴백 · 키워드 풀 하드코딩 | 상태 변이 · 키워드 칩 컴포넌트 | 리스크 점검 · 키워드 풀 v1 확정 |
| 5 | 알림 구독 · Quiet Hours | 푸시 발송 엔진 | 화면 7~9 high-fi | 내부 시연 |

### Week 2

| Day | 모두 |
|---|---|
| 6 | Week 1 빚 갚기 + 내부 dogfood 시작 |
| 7 | 테스트 그룹 온보딩 세션 · 알림 플로우 실전 검증 |
| 8 | 버그 수정 · UX 핫픽스 |
| 9 | 데이터 확인 · 이벤트 분석 |
| 10 | 사용자 인터뷰 · 회고 · Week 3 결정 (GO/NO-GO) |

---

## 15. 에스컬레이션 · 커뮤니케이션

- **일일 스탠드업**: 10분, 매일 오전 10시 (화면공유 금지 — 말로만).
- **블로커**: Slack 채널 (킥오프 이후 확정) · 2시간 넘기면 PO(쟁) 멘션.
- **PR 리뷰 SLA**: 영업일 기준 **4시간 이내** 1차 반응.
- **긴급 프로덕션 이슈**: 전화 (PO 쟁). 24/7 아니고 **평일 21시까지**.

---

## 16. 제외 (Out of Scope — 개발자용)

POC에서 **하지 않는 것**, 시간 아끼기:

- [ ] 테스트 커버리지 목표
- [ ] Storybook
- [ ] 국제화 (i18n)
- [ ] 다크모드
- [ ] 복잡한 state manager (Zustand/Redux)
- [ ] SSR 캐싱 최적화
- [ ] 이미지 CDN 최적화
- [ ] 복수 DB 환경 (dev/staging/prod 3개) — POC는 local + prod 2개만
- [ ] Docker 프로덕션 이미지
- [ ] E2E 테스트 자동화
- [ ] 관리자 대시보드

---

## 17. Changelog

- **v0.5** (2026-04-28) — **저장소 부트스트랩 반영** (Ian)
  - §2 저장소 구조: feature 컴포넌트를 `app/(app)/<route>/_components/` · Server Action을 `_actions.ts`에 **colocate**로 정리. `src/components/{feed,pledge}/` 제거, `src/components/ui/`만 유지 (shadcn primitive)
  - §2 루트 파일 목록 실제와 정합 — `AGENTS.md`(Next.js 16 공식) · `components.json`(shadcn) · `postcss.config.mjs`(Tailwind v4) · `vitest.config.ts` · `.prettierrc` · `.nvmrc` 반영
  - §2 `src/app/api/`를 **외부 콜백 전용**으로 명시 (쓰기는 Server Action 통일)
  - §2.1 네이밍 규칙에 **"feature 컴포넌트는 route colocation"** 항목 추가 (underscore prefix 규약)
- **v0.4** (2026-04-27) — **킥오프 결과 반영 · 타 프로젝트 복사 잔재 정리** (Ian)
  - §0 모니터링 가정: `Sentry 무료 플랜` → **`Vercel Analytics + Logs`** (킥오프 `2.3 기술 스택` 확정)
  - §1 메타: 프로젝트명에 `윗키` 병기 · 팀 R&R 반영 (FE/BE = 쟁뜌 겸임 · 디자인 뜌 · PO 쟁 · 법무 샤쌤 · 리서치 순진) · 저장소 예시를 `with-key`로 구체화
  - §10 전면 개편: Vercel 중심 모니터링(Logs/Analytics/Speed Insights) · Sentry는 선택 도입으로 격하
  - §7 env: Sentry 주석에 "킥오프 기본 off" 명시
  - §14 Week 1 담당 열을 **FE/BE 단일 트랙(쟁뜌 겸임)** 로 통합
  - §15 긴급 연락처 "Ian" → "쟁(PO)"
  - 푸터: `gbike-labs/.gitignore` 잔재 제거 → `.claude/drafts/` 경로로 정정
- **v0.3** (2026-04-27) — **프레임워크 버전 확정** (Ian)
  - §0 프레임워크 가정: `Next.js 15 (App Router) + TypeScript` → **`Next.js 16 (App Router) + TypeScript`** (킥오프 이후 확정)
- **v0.2** (2026-04-24) — **원탭 키워드 → AI 일기 모델 반영** (Ian)
  - §2 저장소 구조에 `lib/keywords/{pool,shuffle}.ts` · `lib/ai/prompts.ts` 추가
  - §6.2 OpenAI 섹션 확장: `DiaryPromptInput` 시그니처 · 키워드 포함 제약 · self-retry · 키워드 활용 템플릿 폴백 · `PROMPT_VERSION` 추적
  - §6.3 키워드 풀 운영 규칙 신설 (POC 기간 변경 금지 · shown_keywords 서버 전송 · reroll 상한 5)
  - §6.4/6.5 번호 조정
  - §11.1 유닛 테스트에 `shuffle.ts` 추가
  - §14 Week 1 Day 4 담당에 키워드 칩 · 풀 v1 확정 반영
- **v0.1** (2026-04-24) — POC Engineering Onboarding 초안. 스택 가정 (Next.js + Supabase + Vercel) 하 작성. 킥오프 후 §0 기준 수정 예정 (Ian)

---

## CI & 배포 (Runway 완료 시점)

### GitHub Actions 파이프라인

- `quick` — 모든 PR blocking. 2~5분. lint + typecheck + unit.
- `integration` — repo-owned PR 만 blocking. 5~10분. 원격 `with-key` 프로젝트에 real RLS 질의.
- `e2e` — integration 뒤 실행. Playwright chromium 단일. 8~15분.

### Supabase 프로젝트 분리 정책 (POC 스케일)

현재 `with-key` 프로젝트 **1개**를 local/CI/preview 가 공유한다. 안전 근거는
`truncate_test_data` 가 `@test.local` 이메일로 스코핑되어 있다는 점
([supabase/migrations/0003_state_transitions.sql](../supabase/migrations/0003_state_transitions.sql)).

v1 컷오버 시 `with-key-prod` 를 별도 생성하며, 그때까지는 이 단일 공유 모델 유지.
자세한 배경은 DECISIONS 의 **D-014**.

### 새 개발자 체크리스트

- [ ] `.env.local` 을 팀원에게 요청하거나 Supabase 대시보드에서 직접 채움.
- [ ] `pnpm exec supabase link --project-ref ohvcaytmzzwxkbxsmyny` 로 로컬 link.
- [ ] Vercel 팀에 초대 요청 (Preview URL 접근 권한).
- [ ] `gh auth login` 으로 PR 생성 + required check 통과 권한 확인.

### Secrets 를 새로 추가할 때

1. GitHub → Settings → Secrets and variables → Actions 에서 `gh secret set <NAME>`.
2. `.github/workflows/ci.yml` 의 **각 job env 블록**에 새 키를 명시적으로 매핑 (secrets 는 자동 전파되지 않음).
3. Vercel → Settings → Environment Variables 에도 동일 값 등록 (Preview scope).
4. `scripts/check-env.ts` 의 `REQUIRED` 에 추가 (로컬 누락 감지).

### 배포 런북

[docs/DEPLOY.md](./DEPLOY.md).

---

> _이 파일은 `.claude/drafts/` 하위의 개인 드래프트로, `.gitignore`에 의해 커밋되지 않습니다._
> _팀 공유 시 저장소 `README.md` 또는 `docs/ONBOARDING.md` 로 복사하세요._
