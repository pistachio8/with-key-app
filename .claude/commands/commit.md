---
description: with-key 프로젝트 기준 커밋 메시지 생성 및 푸시
disable-model-invocation: true
allowed-tools: Bash(git *)
---

# commit.md — with-key(Next.js 16 + Supabase) 전용 커밋 메시지 자동 생성 규칙

너는 `with-key` 저장소의 Git 변경사항을 보고 **단 하나의 커밋 메시지(1줄)** 를 만든다.

**중요**: 이 저장소는 단일 Next.js 앱(+Supabase 마이그레이션)이다. 커밋은 저장소 단위로 atomic하게 수행한다.

## 목표

- 현재 브랜치의 원격 기준(branch tracking)과 작업 트리 차이를 `git diff`로 확인하고,
- 영향 범위(route / lib 도메인 / supabase migration / 설정)를 고려하여,
- 아래 규칙을 만족하는 **한국어 커밋 메시지** 를 생성한다.
- 이후 안전장치를 지키면서 **커밋과 푸시까지 수행**한다.

---

## 출력 형식 (반드시 준수)

- 정확히 1줄만 출력
- 형식: `타입(스코프): 주제`
- 스코프가 애매하면 괄호를 생략하고 `타입: 주제` 로 출력 가능

예시:

- `feat(pledge): 주간 서약 생성 Server Action 추가`
- `fix(middleware): /invite/[token] 경로 auth 가드 예외 누락 수정`
- `refactor(lib/ai): 키워드 커버리지 검증 로직 분리`
- `build(supabase): action_logs GIN 인덱스 마이그레이션 추가`
- `chore(env): VAPID 공개키 변수명 정리`

---

## 타입 (반드시 아래 중 하나)

- feat: 새로운 기능
- fix: 버그 수정
- build: 빌드/의존성/설정 (Next·Tailwind·ESLint 설정, Supabase migration 포함)
- chore: 잡일/자잘한 수정
- ci: CI 설정 (Vercel 연동, GitHub Actions 등)
- docs: 문서
- style: 포맷/린트/스타일 (동작 변화 없음)
- refactor: 리팩토링 (동작 변화 없음이 원칙)
- test: 테스트
- perf: 성능 개선

## 타입 선택 가이드 (우선순위)

- 사용자 영향/버그 → `fix`
- 기능 추가/동작 변경 → `feat`
- 성능 개선 (렌더링·쿼리·AI 지연) → `perf`
- 동작 동일, 구조 개선 → `refactor`
- 포맷/린트만 → `style`
- 설정/스크립트/운영성 수정 → `chore`
- 패키지 / Next·ESLint·Tailwind 설정 / Supabase migration 추가 → `build`
- Vercel·GitHub Actions 파이프라인 → `ci`
- 문서만 → `docs`
- 테스트만 → `test`

---

## 스코프 추천 (with-key 기준)

### Route (App Router)
- `home`, `feed`, `action`, `pledge`, `recap`, `settings` — `src/app/(app)/<route>/**`
- `login`, `invite` — `src/app/(auth)/<route>/**`
- `api/push` — `src/app/api/push/**` (외부 콜백)
- `layout`, `middleware` — 루트 레이아웃 / `middleware.ts`

### lib 도메인
- `lib/supabase` — client · server · middleware
- `lib/ai` — 프롬프트 · OpenAI 호출 · 폴백
- `lib/keywords` — pool · shuffle · reroll
- `lib/push` — VAPID · sendPush · Quiet Hours
- `lib/analytics` — `track` / `AnalyticsEvent`
- `lib/validators` — zod 스키마 (타입 SoT)
- `lib/logger`, `lib/utils`

### UI
- `ui` — shadcn primitive (`src/components/ui/*`)

### 데이터 / 인프라
- `supabase` — `supabase/migrations/*`, `seed.sql`
- `env` — `.env.example`, env 주입 경로
- `scripts` — `scripts/**`
- `deploy`, `ci` — Vercel·GitHub Actions

스코프 선택 규칙:

- 기능/도메인 단위로 1개만 고른다.
- 여러 영역이면 가장 큰 변경 축 1개만 선택한다.
- 정말 애매하면 스코프를 생략한다.

---

## 문장 작성 규칙

- 제목은 **하나의 핵심 변화**만 표현한다.
- 20~45자 내외를 권장한다.
- "~수정", "~추가", "~개선", "~정리", "~분리", "~보완"처럼 끝나게 한다.
- 파일명 나열 금지
- "버그 수정", "코드 수정", "기능 개선"처럼 지나치게 포괄적인 표현 금지
- 가능하면 아래 중 하나를 포함한다.
    - 원인
    - 상황
    - 효과

좋은 예:

- `fix(middleware): 인증 쿠키 리프레시 누락 경로 보정`
- `feat(action): 키워드 칩 원탭 인증 Server Action 연결`
- `refactor(lib/ai): 프롬프트 버전 상수 분리 및 폴백 경로 정리`
- `build(supabase): action_logs shown_keywords 컬럼 추가`
- `perf(feed): RSC fetch 캐시 전략 조정`

나쁜 예:

- `fix: 버그 수정`
- `chore: 코드 정리`
- `feat(ui): 여러 화면 수정`

---

## 실행 규칙 — 커밋 + 푸시까지

너는 커밋 메시지 생성만 하지 않고, 아래 절차에 따라 **커밋과 푸시까지 수행**한다.
단, 반드시 안전장치를 지킨다.

### 안전장치 (필수)

- **이미 스테이징된 파일이 있으면 사용자의 선별 의도를 존중하고 추가 `git add`를 하지 않는다.** (atomic commit 원칙)
  - `git diff --cached --name-only`의 출력이 1개 이상이면 → 그 상태 그대로 커밋하고, 커밋 메시지도 **스테이징된 파일만**을 근거로 작성한다.
  - 스테이징된 것이 없을 때에만 아래 "스테이징 기준/원칙"에 따라 선별 `git add`를 수행한다.
- **Git 저장소 루트(`git rev-parse --show-toplevel`) 외 파일은 스테이징하지 않는다.**
- 대량 변경(예: 50개 파일 초과) 시 주제에 그 성격을 반영한다.
- 루트 설정 파일(`next.config.ts`, `tsconfig.json`, `package.json`, `eslint.config.mjs`, `middleware.ts`)이 포함되면, 현재 작업과 직접 관련 있는지 먼저 판단한다.
- `supabase/migrations/*.sql` 이 포함되면 반드시 주제에 명시하고 append-only 규칙(번호 재정렬/삭제 금지)을 확인한다.
- `.env.local` 등 비밀 값 포함 파일은 스테이징하지 않는다.
- push 실패 시 실패 이유를 한 줄로 요약하고 종료한다.
- force push 금지

### 스테이징 기준

기본 포함:

- 현재 Git 저장소 루트 하위 파일

조건부 포함:

- `next.config.ts` / `middleware.ts` / `eslint.config.mjs` — 현재 주제와 직결된 경우
- `tsconfig.json` / `.prettierrc` / `postcss.config.mjs` — 현재 주제 지원이 명확한 경우
- `scripts/**` — 현재 주제 지원이 명확한 경우
- `package.json` / `pnpm-lock.yaml` — 의존성 추가/제거가 주제에 포함된 경우
- `supabase/migrations/*.sql` — 마이그레이션 신규 추가가 주제에 포함된 경우

기본 제외:

- `.env.local`, `.env.*.local` (env 예시는 `.env.example`만 포함)
- `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` 등 빌드 산출물
- 현재 작업 목적과 상관없는 문서/설정 변경

### 스테이징 원칙

- 기본은 `git add -A` 를 사용하지 않는다.
- 먼저 변경 목록을 보고 현재 주제와 직결된 파일만 선택적으로 스테이징한다.
- `supabase/migrations/` 파일이 **기존 파일 수정**(번호 재사용·내용 변경)이면 스테이징하지 않고 경고한다. 신규 번호로 append 하는 것이 원칙.

---

## 절차 (반드시 순서대로)

1. 현재 저장소/브랜치/업스트림 확인
    - `git rev-parse --show-toplevel`
    - `git status -sb`
    - `git rev-parse --abbrev-ref HEAD`
    - `git rev-parse --abbrev-ref @{u}` (가능하면)

2. 변경 확인 (원격 대비)
    - `git diff --name-status @{u}...HEAD`
    - 필요 시 `git diff --stat @{u}...HEAD`
    - 필요 시 `git diff @{u}...HEAD`

3. 작업 트리 확인
    - `git status --short`

4. 스테이징 (선별 의도 존중 우선)
    - **먼저 `git diff --cached --name-only`로 이미 스테이징된 파일이 있는지 확인한다.**
    - 스테이징된 파일이 **1개 이상**이면: 추가 `git add`를 하지 않고 해당 상태 그대로 다음 단계로 진행한다.
      (커밋 메시지도 `git diff --cached` 결과만을 근거로 작성)
    - 스테이징된 파일이 **없으면만** 아래 기준으로 `git add`를 수행한다.
      - 현재 저장소 루트 기준 주제 관련 파일만 스테이징한다.
      - `.env.local`, 빌드 산출물, 기존 마이그레이션 파일 수정은 제외한다.

5. 스테이징 검증
    - `git diff --cached --name-status`
    - 스테이징이 비어 있으면 종료한다.

6. 커밋 메시지 생성
    - `타입(스코프): 주제`
    - 한국어 1줄

7. 커밋 생성
    - `git commit -m "<생성한 메시지>"`

8. 푸시
    - 업스트림이 설정되어 있으면: `git push`
    - 업스트림이 없으면: `git push -u origin HEAD`

---

## 예외 처리 규칙

### 업스트림이 없는 경우

- 브랜치에 업스트림이 없으면 `git push -u origin HEAD` 를 사용한다.

### 원격 대비 diff가 비어 있지만 작업 트리에 변경이 있는 경우

- 작업 트리와 스테이징 상태를 기준으로 메시지를 생성한다.

### 기존 `supabase/migrations/*.sql` 수정이 포함된 경우

- 스테이징에서 제외하고 사용자에게 append-only 원칙을 안내한 뒤 종료하거나 다음 스테이징으로 진행한다.

### `.env*` 변경이 포함된 경우

- `.env.example` 만 포함하고, `.env.local` 계열은 스테이징에서 반드시 제외한다.

---

## 최종 출력 형식

최종 응답은 아래 3줄만 출력한다. 추가 설명은 금지한다.

1. 커밋 메시지 1줄
2. 스테이징된 파일 요약 (예: `staged: 8 files`)
3. 푸시 결과 요약 (예: `push: success` 또는 `push: failed - upstream not found`)
