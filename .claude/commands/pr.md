---
description: with-key 프로젝트 기준 PR 설명 생성
disable-model-invocation: true
allowed-tools: Bash(git *)
---

# pr.md — with-key(Next.js 16 + Supabase) 전용 PR 설명 생성 규칙

너는 `with-key` 저장소의 Git 변경사항을 바탕으로 **PR 제목과 본문**을 생성한다.

## 목표

- 현재 브랜치와 업스트림(또는 기본 비교 브랜치 `main`) 기준 diff를 확인한다.
- 영향 범위(route / lib 도메인 / Supabase 마이그레이션 / env / 미들웨어)를 중심으로 PR 제목과 본문을 생성한다.
- 결과는 **한국어**, **실무형**, **리뷰 친화적**이어야 한다.

## 출력 형식

출력은 아래 순서를 정확히 따른다.

1. `제목: ...`
2. 빈 줄
3. 아래 마크다운 템플릿 형식의 PR 본문

```md
## 요약

- ...
- ...

## 변경 사항

- ...
- ...
- ...

## 영향 범위

- 사용자 영향:
- 개발 영향:
- 관련 경로:
- 교차 영향(route / lib / supabase / env):

## 아키텍처 가드레일 체크

- Route colocation 준수 (`_components`, `_actions.ts`):
- 쓰기 경로 Server Action 사용:
- zod 타입 SoT 위반 여부 (`src/lib/validators/`):
- SWR/React Query 도입 여부:
- `src/features/` 신규 생성 여부:

## Supabase / 보안 체크

- migration 변경: (파일명 / append-only 여부)
- RLS 영향:
- Storage pre-signed URL 사용 여부:
- 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` / `VAPID_PRIVATE_KEY`) 노출 위험:

## 검증

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build` (설정·middleware·migration 변경 시 필수)
- [ ] 수동 확인 (주요 플로우)

## 체크 포인트

- ...
- ...

## 리스크 / 후속 작업

- ...
```

- 제목과 본문 외의 설명은 출력하지 않는다.
- 코드블록 바깥에 불필요한 안내 문구를 추가하지 않는다.

## 제목 규칙

- 형식: `타입(스코프): 주제`
- 스코프가 애매하면 `타입: 주제` 로 출력 가능
- 제목은 1줄
- 한국어
- 20~45자 내외 권장

예:

- `fix(middleware): invite 경로 auth 가드 예외 누락 수정`
- `feat(action): 키워드 칩 원탭 인증 Server Action 연결`
- `refactor(lib/ai): 프롬프트 버전 상수 분리 및 폴백 경로 정리`
- `build(supabase): action_logs shown_keywords 컬럼 마이그레이션 추가`

## 타입 규칙

반드시 아래 중 하나만 사용한다.

- feat / fix / build / chore / ci / docs / style / refactor / test / perf

## 스코프 추천

### Route
- `home`, `feed`, `action`, `pledge`, `recap`, `settings`, `login`, `invite`
- `api/push`, `layout`, `middleware`

### lib 도메인
- `lib/supabase`, `lib/ai`, `lib/keywords`, `lib/push`, `lib/analytics`, `lib/validators`, `lib/logger`, `lib/utils`

### UI / 데이터 / 인프라
- `ui` (shadcn primitive)
- `supabase` (migrations)
- `env`, `scripts`, `deploy`, `ci`

스코프 선택 규칙:

- 기능/도메인 단위로 1개만 고른다.
- 여러 영역이면 가장 큰 변경 축 1개만 선택한다.
- 정말 애매하면 스코프를 생략한다.

## 작성 규칙

### 공통

- 모두 한국어로 작성한다.
- 과장된 표현, 마케팅성 표현, 모호한 표현은 피한다.
- 파일명 나열 위주로 쓰지 않는다.
- "버그 수정", "코드 정리", "기능 개선"처럼 지나치게 포괄적인 표현은 피한다.
- 가능한 한 **무엇이 왜 바뀌었는지**가 드러나게 작성한다.

### 요약

- 왜 바꾸는지 중심으로 1~2개 bullet 작성
- 사용자/운영자 맥락 또는 문제 상황이 드러나게 작성
- 구현 디테일보다는 변경 목적을 우선 설명

### 변경 사항

- 실제로 바뀐 핵심만 2~5개 bullet 작성
- 구현 상세를 지나치게 장황하게 쓰지 않는다
- 파일명 나열 대신 동작/구조 관점으로 요약한다

### 영향 범위

아래를 반드시 포함한다.

- 사용자 영향
- 개발 영향
- 관련 경로 (route 또는 lib 도메인)
- 교차 영향 (route / lib / supabase / env 어느 축을 동시에 건드리는지)

예:

- 사용자 영향: 초대 링크 진입 시 로그인 화면으로 튕기던 회귀 해소
- 개발 영향: `middleware.ts` matcher와 auth 가드 분기 변경. Supabase 쿠키 리프레시 경로 동일
- 관련 경로: `middleware.ts`, `src/app/(auth)/invite/[token]/**`
- 교차 영향: middleware + route 동시 변경, supabase/env 영향 없음

### 아키텍처 가드레일 체크

아래 항목을 사실 그대로 기재한다. 해당 없으면 `영향 없음` / `없음`으로 명시한다.

- Route colocation: feature성 파일이 `app/<route>/_components`, `_actions.ts` 에 위치하는가
- 쓰기 경로: Server Action 사용 여부 (`app/api/*`는 외부 콜백 전용 유지)
- zod 타입 SoT: 도메인 타입을 `src/lib/validators/`에서 `z.infer`로 도출하는가
- SWR/React Query: 금지 대상 라이브러리 신규 도입 여부
- `src/features/`: 신규 생성 여부 (금지)

### Supabase / 보안 체크

- migration 변경: 신규 파일명과 append-only 여부. 기존 파일 수정은 원칙상 금지
- RLS 영향: 테이블 추가/정책 변경이 있으면 요약
- Storage: 버킷 접근이 Pre-signed URL인지 (Public 버킷 금지)
- 서버 전용 키 노출 위험: `NEXT_PUBLIC_` 접두가 서버 전용 키에 붙지 않았는지, 클라이언트 컴포넌트로 유입되지 않았는지

### 검증

가능한 경우 아래 기준으로 체크 여부를 작성한다.

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build` — `next.config.ts` / `middleware.ts` / `eslint.config.mjs` / `tsconfig.json` / Supabase migration 변경 시 필수
- 수동 확인: 영향받는 route의 주요 플로우 (모바일 Safari / Vercel Preview URL)

실제로 확인하지 못한 항목은 체크하지 않는다.

### 체크 포인트

- 리뷰어가 집중해서 봐야 할 포인트 2개 내외
- **다음 항목을 우선 고려한다**:
  - Server Action 인자/반환의 직렬화 가능성, `'use server'` / `'use client'` 경계
  - `@supabase/ssr` client 구분 (브라우저 vs 서버) 혼용 여부
  - Supabase 마이그레이션 append-only / RLS 정책 누락
  - AI 호출(`lib/ai`)의 타임아웃·키워드 커버리지·폴백 경로 유지
  - `AnalyticsEvent` 유니온 임의 확장 여부
  - shadcn primitive 재사용 여부

### 리스크 / 후속 작업

- 남아 있는 한계나 추가 확인 필요 사항이 있으면 적는다
- 없으면 `- 없음` 으로 작성 가능
- migration 후 seed/back-fill 필요 여부, env 추가 배포 필요 여부 반영

## 작업 절차

1. 현재 저장소/브랜치와 업스트림을 확인한다.
2. 원격 대비 변경 목록을 확인한다.
3. 필요하면 diff stat과 상세 diff를 확인한다.
4. 변경 파일을 Route / lib / UI / Supabase / env/설정 단위로 분류한다.
5. 제목용 타입 / 스코프 / 주제를 정한다.
6. 변경 목적, 핵심 수정 사항, 영향 범위, 가드레일 체크, 검증 포인트를 정리한다.
7. 지정된 출력 형식으로 PR 제목과 본문을 생성한다.

## 변경 해석 기준

우선적으로 아래 경로를 본다.

- `src/app/**` (route / Server Action / Route Handler)
- `src/lib/**` (도메인 유틸)
- `src/components/ui/**`
- `middleware.ts`
- `supabase/migrations/**`, `supabase/seed.sql`
- `scripts/**`
- 루트 설정 파일 (`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`)
- `.env.example`

기본적으로 제외한다.

- `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`
- 현재 PR 목적과 상관없는 문서/설정 변경

## 영향 범위 작성 규칙

`src/lib/**` 변경이 포함되면 소비 route를 식별해 `영향 범위`에 적는다.

- 사용자 영향: 어떤 화면(route)까지 전파되는지
- 개발 영향: 어떤 시그니처/타입/동작이 바뀌었는지
- 관련 경로: `src/lib/...` 와 해당 lib을 import하는 route 목록
- 교차 영향: route / lib / supabase / env / middleware 중 실제 영향 축

## 권장 확인 명령

- `git status -sb`
- `git rev-parse --show-toplevel`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse --abbrev-ref @{u}`
- `git diff --name-status @{u}...HEAD`
- `git diff --stat @{u}...HEAD`
- `git diff @{u}...HEAD`

업스트림이 없는 경우에는 기본 브랜치(`main`)와 비교 가능한 범위에서 해석한다.

## 예시 출력

제목: fix(middleware): invite 경로 auth 가드 예외 누락 수정

## 요약

- 초대 링크(`/invite/[token]`) 진입 시 미인증 사용자가 `/login`으로 튕기던 회귀를 해소했습니다.
- `middleware.ts` matcher와 auth 가드 분기에서 예외 경로 판정이 누락된 부분을 보정했습니다.

## 변경 사항

- `updateSession()` 내 auth 가드에서 `/invite/*` prefix 예외를 추가했습니다.
- matcher 패턴에 정적 자산·이미지 제외를 유지하면서 `/invite/:token*` 경로만 가드 우회되도록 정리했습니다.
- 기존 `/`, `/login` 예외 처리에 대한 회귀가 없는지 확인했습니다.

## 영향 범위

- 사용자 영향: 초대 링크로 진입한 미인증 사용자가 바로 초대 화면을 볼 수 있습니다.
- 개발 영향: `middleware.ts` 의 auth 가드 분기만 변경. 쿠키 리프레시 로직은 동일.
- 관련 경로: `middleware.ts`, `src/app/(auth)/invite/[token]/page.tsx`
- 교차 영향(route / lib / supabase / env): middleware + auth route, supabase/env 영향 없음

## 아키텍처 가드레일 체크

- Route colocation 준수: 영향 없음
- 쓰기 경로 Server Action 사용: 영향 없음
- zod 타입 SoT 위반 여부: 영향 없음
- SWR/React Query 도입 여부: 없음
- `src/features/` 신규 생성 여부: 없음

## Supabase / 보안 체크

- migration 변경: 없음
- RLS 영향: 없음
- Storage pre-signed URL 사용 여부: 영향 없음
- 서버 전용 키 노출 위험: 없음

## 검증

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] 수동 확인 (로그인/초대 링크 플로우)

## 체크 포인트

- matcher 패턴에서 정적 자산 제외가 깨지지 않았는지 확인 부탁드립니다.
- 로그인 완료 후 원래 목적지로 돌아가는 리다이렉트가 여전히 동작하는지 확인 부탁드립니다.

## 리스크 / 후속 작업

- 없음
