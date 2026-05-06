---
description: with-key 프로젝트 기준 PR 리뷰 체크리스트 생성
disable-model-invocation: true
allowed-tools: Bash(git *)
---

# review-mr.md — with-key(Next.js 16 + Supabase) 전용 PR 리뷰 규칙

너는 `with-key` 저장소의 PR 변경사항을 검토하고 **리뷰 결과 요약**을 생성한다.

**리뷰의 핵심 축**:
1. **아키텍처 가드레일** — Route colocation 준수, Server Action 쓰기 경로, zod 타입 SoT, `src/features/` 금지, SWR/React Query 금지
2. **Supabase / 보안** — `@supabase/ssr` 브라우저/서버 client 구분, RLS 전제, Storage pre-signed URL, 서버 전용 키(`SERVICE_ROLE` / `OPENAI_API_KEY` / `VAPID_PRIVATE_KEY`) 비노출
3. **migration append-only** — `supabase/migrations/*.sql` 기존 파일 수정·재정렬 금지
4. **도메인 계약** — AI 호출 타임아웃·키워드 커버리지 폴백, `AnalyticsEvent` 유니온 보존, 키워드 풀 변경 금지(POC 기간)

## 목표

- 현재 브랜치의 변경 또는 비교 대상 브랜치(`main`)와의 diff를 확인한다.
- 결과는 **리뷰어가 바로 사용할 수 있는 리뷰 요약 + 체크 포인트 + 리스크** 형태의 한국어 문서여야 한다.

## 출력 형식

출력은 아래 마크다운 구조를 정확히 따른다.

1. 아래 형식의 리뷰 결과를 출력한다.
2. 형식 외의 불필요한 설명은 출력하지 않는다.

```md
## 리뷰 요약

- ...

## 확인한 항목

- [x] ...
- [ ] ...

## 주요 코멘트

- 심각도: high | medium | low
  위치: ...
  내용: ...

## 아키텍처 가드레일 점검

- Route colocation: ...
- Server Action 쓰기 경로: ...
- zod 타입 SoT: ...
- SWR/React Query 도입: ...
- `src/features/` 신규 생성: ...

## Supabase / 보안 점검

- migration append-only: ...
- RLS / 정책 영향: ...
- Storage pre-signed URL: ...
- 서버 전용 키 노출 위험: ...

## 체크 포인트

- ...
- ...

## 판정

- approve 권장 / comment 권장 / changes requested 권장

## 후속 제안

- ...
```

- 코멘트가 없더라도 `주요 코멘트` 섹션은 유지한다.
- 심각한 이슈가 없으면 `주요 코멘트`에 경미한 개선점 또는 `- 없음`을 둘 수 있다.
- `아키텍처 가드레일 점검` / `Supabase 보안 점검`은 항상 모든 항목을 기재한다(해당 없으면 `영향 없음`).

## 리뷰 기준

다음 항목을 우선 검토한다.

### 1. 요구사항 관점

- 변경 목적이 코드에 반영되어 있는지
- 의도와 다른 동작 가능성이 없는지

### 2. 아키텍처 경계

- feature성 컴포넌트/액션이 route 하위(`app/<route>/_components/`, `_actions.ts`)에 위치하는지
- `src/features/` 신규 생성 여부 (금지)
- `src/lib/**`에 올라가는 로직이 정말 2개 이상 route에서 재사용되는지 (조기 공용화 지양)
- `app/api/*` Route Handler가 외부 콜백 전용으로만 쓰이는지 (쓰기는 Server Action)
- SWR/React Query 신규 도입이 없는지

### 3. Server Action / RSC 경계

- `'use server'` / `'use client'` 지시어가 명확한지
- Server Action 인자/반환값이 직렬화 가능한지 (클래스 인스턴스·Date 등 주의)
- `revalidatePath` / `redirect` 위치가 적절한지
- `useEffect` + `fetch` 쓰기 패턴이 섞여 있지 않은지

### 4. Supabase / 보안

- `@supabase/ssr` client 구분: 브라우저는 `lib/supabase/client.ts`, 서버는 `lib/supabase/server.ts` — 혼용 여부
- `middleware.ts`의 `updateSession()`과 auth 가드 예외(`/`, `/login`, `/invite/*`)가 보존되는지
- Storage 접근이 Pre-signed URL인지 (Public 버킷 금지)
- 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` / `VAPID_PRIVATE_KEY`)가 클라이언트 컴포넌트 또는 `NEXT_PUBLIC_` 변수에 유입되지 않는지
- RLS 전제 위반: service role 남용이 없는지

### 5. 데이터 / Migration

- `supabase/migrations/*.sql` 기존 파일이 수정·재정렬되지 않았는지 (append-only)
- 신규 migration 파일명이 `000X_<snake_case>.sql` 규칙을 따르는지
- RLS 정책이 함께 갱신되었는지 (신규 테이블일 때)
- 인덱스가 PRD §8.3 핵심 인덱스 규칙에 부합하는지 (예: `action_logs(user_id, created_at DESC)`)

### 6. 타입 안전성 / zod SoT

- 도메인 타입을 `src/lib/validators/` 스키마에서 `z.infer`로 도출하는지
- `any` 추가, 불필요한 `as` 단언, `!` non-null 단언
- 외부 입력(Server Action 인자, Route Handler body, env)을 zod로 검증하는지

### 7. 도메인 계약

- AI 호출(`lib/ai`): 4.5초 타임아웃(`AbortController`), 키워드 커버리지 < 1 시 `templateFallback()` 폴백, 프롬프트/응답 본문 로깅 금지
- 키워드 풀(`lib/keywords/pool.ts`) 변경 여부 — POC 기간 중 변경은 PO 승인 필요
- `lib/analytics/track.ts`의 `AnalyticsEvent` 유니온 임의 확장 여부 — PO 승인 필요
- Web Push: `isQuietHoursKST()` 분기 유지 여부

### 8. UI / 상태

- shadcn primitive(`src/components/ui/*`) 재사용 여부, 중복 구현 유무
- 로딩/빈/에러 상태 처리
- 모바일(PWA) 환경의 터치 영역, iOS Safari 회귀 여지

## 심각도 기준

### high

- 사용자 기능이 깨질 가능성이 큼
- 런타임 에러 가능성 높음
- **서버 전용 키가 클라이언트 번들로 유입될 위험**
- **기존 `supabase/migrations/*.sql` 수정·재정렬 또는 RLS 누락**
- **`middleware.ts`의 auth 가드 예외 경로가 깨짐**
- **Server Action 경로를 우회한 쓰기 (`app/api/*`에 임의 쓰기 엔드포인트 추가 등)**
- zod 검증 없이 외부 입력을 그대로 사용
- AI 호출에서 타임아웃/폴백 경로가 제거됨
- 명확한 회귀 위험

### medium

- 구조상 불안정하거나 유지보수성이 떨어짐
- Route colocation 이탈 (feature성 컴포넌트가 `src/lib/`에 올라감)
- `src/features/` 신규 생성, SWR/React Query 신규 도입
- 타입 SoT 이탈 (zod 없이 수동 타입 중복 선언)
- MobX/전역 상태 등 POC 범위 초과 라이브러리 도입
- 접근성, 테스트 누락 등 품질 리스크

### low

- 네이밍, 표현, 경미한 중복
- shadcn primitive 재사용으로 정리 가능한 수준
- 지금 바로 문제는 아니지만 개선 여지가 있는 항목

## 작성 규칙

### 공통

- 모두 한국어로 작성한다.
- 감정적 표현, 단정적인 비난 표현은 금지한다.
- 단정이 어려우면 "가능성이 있다", "확인이 필요하다"처럼 표현한다.
- 리뷰는 문제 지적만 하지 말고 가능한 수정 방향까지 포함한다.
- 불필요하게 사소한 코멘트를 많이 만들지 않는다.
- 핵심 리스크부터 우선순위 있게 정리한다.

### `src/lib/**` 변경 리뷰 원칙

- lib 수정이 포함되면 **소비 route 범위**와 영향 가능성을 먼저 코멘트에 명시한다.
- 단일 route 전용 로직이면 해당 route `_components/` 또는 `_actions.ts`로 내리는 편이 맞는지 확인한다.
- 시그니처 변경이 포함되면 breaking 여부와 호환 전략을 묻는다.

### migration 리뷰 원칙

- 신규 migration 파일이 추가되면 RLS 정책 파일(`0002_rls.sql` 또는 후속 정책 migration)과의 정합성을 확인한다.
- 기존 migration 수정/삭제가 보이면 즉시 high로 지적한다.

### 리뷰 요약

- 전반적인 방향성과 품질 상태를 1~2개 bullet로 정리한다.
- 가장 중요한 리스크가 있다면 요약에 먼저 드러낸다.

### 확인한 항목

- 실제 diff 근거가 있는 항목만 체크한다.
- 확인하지 못한 항목은 체크하지 않는다.
- 형식적 체크를 하지 않는다.

### 주요 코멘트

각 코멘트는 아래 형식을 따른다.

- 심각도: high | medium | low
  위치: 파일 경로 또는 모듈명
  내용: 문제 상황, 이유, 권장 수정 방향을 짧게 작성

예:

- 심각도: high
  위치: `src/app/(app)/action/_actions.ts`
  내용: `createAdminClient()`를 Server Action에서 직접 사용해 RLS를 우회하고 있습니다. 사용자 컨텍스트 쿼리는 `lib/supabase/server.ts`의 `createServerClient()`로 수행하고, service role은 Web Push 발송 등 서버 전용 백그라운드 작업에 한정하는 편이 안전합니다.

### 아키텍처 가드레일 점검

아래를 항상 기재한다.

- Route colocation: feature성 파일이 `app/<route>/_components`, `_actions.ts`에 있는지
- Server Action 쓰기 경로: `app/api/*`에 신규 쓰기 엔드포인트가 추가되지 않았는지
- zod 타입 SoT: 도메인 타입이 `src/lib/validators/`에서 파생되는지, 수동 타입 중복이 없는지
- SWR/React Query 도입: 신규 도입 여부
- `src/features/` 신규 생성: 여부

### Supabase / 보안 점검

- migration append-only: 신규 파일인지, 기존 파일 수정이 없는지
- RLS / 정책 영향: 신규 테이블의 RLS 정책 누락 여부
- Storage pre-signed URL: Public 버킷 사용이 없는지
- 서버 전용 키 노출 위험: 클라이언트 컴포넌트 유입, `NEXT_PUBLIC_` 접두 오남용 여부

### 체크 포인트

- 리뷰어 또는 작성자가 추가로 확인해야 할 항목을 2개 내외로 정리한다.
- 수동 확인(Vercel Preview URL의 모바일 Safari), `pnpm build` 통과 여부, 영향받는 route의 플로우 재현을 우선 고려한다.

### 판정

아래 중 하나만 선택한다.

- `approve 권장`
- `comment 권장`
- `changes requested 권장`

### 후속 제안

- 후속 테스트, 구조 개선, 문서 보강, QA 항목 추가 등을 짧게 적는다.
- 없으면 `- 없음`으로 작성 가능

## 작업 절차

1. 현재 저장소/브랜치와 비교 대상을 확인한다.
2. 변경 파일 목록과 diff를 확인한다.
3. 변경을 Route / lib / UI / Supabase / middleware / 설정으로 분류한 뒤 이해한다.
4. 필요 시 관련 설정(`next.config.ts`, `middleware.ts`, `eslint.config.mjs`, `.env.example`)까지 함께 본다.
5. 요구사항, 아키텍처 경계, Server Action/RSC, Supabase/보안, migration, 타입 SoT, 도메인 계약, UI 관점으로 문제 가능성을 정리한다.
6. 심각도 기준에 따라 주요 코멘트를 분류한다.
7. 지정된 출력 형식으로 리뷰 결과를 생성한다.

## 확인 항목 템플릿

가능한 범위에서 아래를 체크한다.

- 요구사항과 구현 방향이 일치함
- Route colocation 유지 (`_components`, `_actions.ts`)
- `src/features/` 신규 생성이 없음
- 쓰기 경로가 Server Action이며 `app/api/*`는 외부 콜백 전용
- SWR/React Query 신규 도입이 없음
- zod 스키마가 타입 SoT로 유지됨
- `@supabase/ssr` 브라우저/서버 client 구분이 명확함
- `middleware.ts`의 auth 가드 예외(`/`, `/login`, `/invite/*`)가 유지됨
- 서버 전용 키가 클라이언트 번들에 유입되지 않음
- `supabase/migrations/*.sql` append-only 규칙 준수
- 신규 테이블의 RLS 정책 갱신이 포함됨
- AI 호출 타임아웃·키워드 커버리지·폴백 유지
- `AnalyticsEvent` 유니온 임의 확장이 없음
- 키워드 풀(`lib/keywords/pool.ts`) 변경이 없음 (POC 기간)
- shadcn primitive 재사용 여부를 고려함
- 로딩/빈 상태/에러 상태를 고려함
- 테스트 또는 수동 검증 포인트가 보임

체크 여부는 실제 diff 근거 기반으로만 판단한다.

## 판정 규칙

### approve 권장

- 치명적 문제 없음
- 경미한 개선 사항만 있음
- 머지 전 필수 수정이 없어 보임

### comment 권장

- 지금 머지 가능하지만 보완 의견이 있음
- 중간 정도의 리스크나 구조 개선 포인트가 있음

### changes requested 권장

- 머지 전 수정이 필요한 문제 존재
- high 심각도 이슈(서버 전용 키 노출, migration append-only 위반, middleware auth 가드 훼손, RLS 누락, AI 폴백 제거 등)

## 변경 해석 기준

우선적으로 아래 경로를 본다.

- `src/app/**` (route / Server Action / Route Handler)
- `src/lib/**`
- `src/components/ui/**`
- `middleware.ts`
- `supabase/migrations/**`, `supabase/seed.sql`
- `scripts/**`
- 루트 설정 파일
- `.env.example`

기본적으로 제외한다.

- `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`
- 현재 리뷰 목적과 관계없는 변경

## 권장 확인 명령

- `git status -sb`
- `git rev-parse --show-toplevel`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse --abbrev-ref @{u}`
- `git diff --name-status @{u}...HEAD`
- `git diff --stat @{u}...HEAD`
- `git diff @{u}...HEAD`

업스트림이 없으면 기본 브랜치(`main`) 기준으로 해석한다.

## 예시 출력

## 리뷰 요약

- 초대 링크 진입 시 auth 가드 예외 누락 회귀 수정은 목적과 구현이 일치합니다.
- middleware matcher 변경이 정적 자산 제외 범위에 영향을 주지 않는지 한 번 더 확인이 필요합니다.

## 확인한 항목

- [x] 요구사항과 구현 방향이 일치함
- [x] Route colocation 유지
- [x] `src/features/` 신규 생성이 없음
- [x] 쓰기 경로가 Server Action이며 `app/api/*`는 외부 콜백 전용
- [x] `middleware.ts`의 auth 가드 예외가 유지됨
- [ ] 신규 migration 영향 (해당 변경 없음)

## 주요 코멘트

- 심각도: medium
  위치: `middleware.ts`
  내용: matcher 정규식에 `/invite/:token*` 예외를 추가하면서 기존 정적 자산 제외 패턴과 우선순위가 모호해졌습니다. `/_next/static` 경로 요청이 여전히 제외되는지 테스트로 확인하는 편이 안전합니다.

## 아키텍처 가드레일 점검

- Route colocation: 영향 없음
- Server Action 쓰기 경로: 영향 없음
- zod 타입 SoT: 영향 없음
- SWR/React Query 도입: 없음
- `src/features/` 신규 생성: 없음

## Supabase / 보안 점검

- migration append-only: 영향 없음
- RLS / 정책 영향: 영향 없음
- Storage pre-signed URL: 영향 없음
- 서버 전용 키 노출 위험: 영향 없음

## 체크 포인트

- Vercel Preview URL에서 모바일 Safari로 초대 링크 진입 플로우를 확인 부탁드립니다.
- 로그인 완료 후 원래 목적지로 돌아가는 리다이렉트가 여전히 동작하는지 확인 부탁드립니다.

## 판정

- comment 권장

## 후속 제안

- middleware 예외 경로 회귀용 단위 테스트를 1~2개 추가하면 같은 회귀를 빠르게 잡을 수 있을 것 같습니다.
