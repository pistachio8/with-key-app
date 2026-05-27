# ADR-0023-auth-getclaims-replace-getuser: getAuthedUser 의 auth.getUser → auth.getClaims 치환

**Date**: 2026-05-27
**Status**: proposed
**Deciders**: pistachio8

## Context

ADR-0022 가 RSC 12곳 + helper 1곳을 `getAuthedUser()` (React `cache()` wrapper) 경유로 통합해 단일 request scope 안의 `supabase.auth.getUser()` 호출을 1회로 dedup 했다. 그러나 2026-05-27 오전 Vercel 로그에 `over_request_rate_limit` (HTTP 429) 가 560ms 안에 70+ 건 폭증.

`React.cache()` 의 dedup 범위는 단일 request scope 한정이다. 다음 경로에서 GoTrue `/auth/v1/user` 호출이 곱해지는 것이 잔류 압력으로 추정된다:

1. **`<Link>` prefetch** — viewport/hover 진입만으로 Next.js 가 RSC 페이로드 background fetch. 각 prefetch = 새 request = 새 cache scope.
2. **`cacheComponents: true` + PPR** (`next.config.ts`) — 한 request 당 prerender pass + dynamic streaming pass 두 번 render tree 가 돌 가능성. 로그 timestamp 가 쌍으로 찍히는 패턴과 정합.
3. Dev/Turbopack double render, push subscription background ping, 다중 탭/창.

즉 ADR-0022 가 해결한 축은 "한 페이지 안의 호출 곱셈" 이고, 잔류 429 의 원인은 "여러 request 의 합계 호출량" 이다. React `cache()` 로는 후자를 구조적으로 해결할 수 없다.

`@supabase/auth-js@2.105.1` 은 `auth.getClaims()` API 를 제공한다. asymmetric JWT 서명 키 (RS256/ES256) 가 프로젝트에 활성화된 경우, JWKS 를 클라이언트가 캐시하고 JWT 서명을 로컬에서 WebCrypto API 로 검증해 **네트워크 호출 없이** claims 를 반환한다. symmetric (HS256) 프로젝트는 여전히 네트워크 호출.

## Decision

**`src/lib/supabase/auth.ts` 의 `getAuthedUser()` 안에서 `supabase.auth.getUser()` 대신 `supabase.auth.getClaims()` 를 호출한다.**

- claims 의 `sub` → `user.id`, `email` → `user.email` 매핑
- 반환 타입을 `{ user: User | null }` 에서 `{ user: AuthedUser | null }` (`AuthedUser = { id: string; email: string | null }`) 로 좁힘 — 호출자 11+ 곳이 `id` / `email` 만 사용
- React `cache()` wrapper 는 유지 — Activity/PPR pass 간 추가 호출 시 보호
- `getClaims()` 의 3가지 반환 union (`data: claims`, `data: null + error`, `data/error 둘 다 null`) 을 모두 null user 로 매핑 (현 `error` 단일 분기에서 확장)

### 적용 범위 (1곳)

- `src/lib/supabase/auth.ts` — `getAuthedUser` 본문 + 반환 타입
- `src/lib/supabase/auth.spec.ts` — `getClaims` mock 으로 전환 + null 케이스 2종 추가

### 적용 제외

ADR-0022 의 "적용 제외 6곳" 은 그대로 유지. 이유:

- `middleware.ts`: edge runtime, JWT 검증 결과를 cookie 갱신 로직에 직접 써야 함
- `auth/callback/route.ts`: 매직링크 직후 fresh user metadata (`app_metadata.provider`) 필요
- `login/_actions.ts`: 로그인 직후 fresh getUser 가 의도
- `with-user.ts`: server action 진입점 — 이미 `getAuthedUser()` 경유로 ADR-0022 적용 완료. 추가 변경 없음
- `api/me/route.ts`, `api/og/recap-card/route.tsx`: 단발 API route

## Alternatives Considered

### 1. 루트 `middleware.ts` 도입 + 헤더로 user.id 전달

- **Pros**: getUser 호출이 진정으로 1 req/request 가 됨. RSC 코드에서 인증 호출 제거 가능
- **Cons**: 변경 폭 큼 — 모든 RSC 의 `requireUser()` / `getAuthedUser()` 호출 패턴 재설계 필요. 헤더 인증의 보안 신뢰 모델 정립 (request spoofing 가드) 별도 필요
- **Why not**: 본 ADR 의 1파일 변경 대비 ROI 낮음. `getClaims()` 가 충분히 효과를 내면 후속 ADR 로 분리

### 2. ESLint custom rule 로 `auth.getUser` 직접 호출 차단

- **Pros**: 신규 회귀 방어
- **Cons**: 호출량 자체는 안 줄어듦
- **Why not**: 본 ADR 의 목적(429 압력 감소) 미달. 후속 chore PR 로 분리 가능

### 3. 자체 JWT 검증 (jose 라이브러리 직접 사용)

- **Pros**: SDK 의존도 ↓
- **Cons**: JWKS rotation/캐싱 로직을 자체 구현해야 함. Supabase 가 이미 제공
- **Why not**: 차이 없음. supabase-js 의 `getClaims()` 가 사실상 동일 동작

## Consequences

### 긍정적

- asymmetric JWT 키 활성 프로젝트에서 GoTrue `/auth/v1/user` 호출이 거의 0 (JWKS 첫 fetch + cache 후 로컬 검증)
- `over_request_rate_limit` (429) downstream 회귀 (e.g. `createSignedUrl` 실패 → 사진 미표시) 완화
- 변경 폭 최소 — 1파일 본문 + 1 spec. 호출자 코드 0줄 수정 (반환 객체의 `.id` / `.email` 인터페이스 유지)

### 부정적 / 비용

- **asymmetric JWT 키 미활성 프로젝트에서는 효과 없음**. Supabase Dashboard → Auth → Sessions → JWT Settings 에서 asymmetric signing key 활성화 필요. 이 ADR 머지 후 Vercel 로그에서 호출량이 줄지 않으면 dashboard 설정부터 확인
- 반환 타입을 `User` (supabase 풀 객체) → `AuthedUser` 로 좁힘 — 미래 RSC 가 `app_metadata` / `phone` 등이 필요하면 별도 경로 (raw `auth.getUser` 또는 `users` 테이블 select) 필요. 현재 11+ 호출자 grep 결과 `id` / `email` 만 사용
- `getClaims()` 의 보안 모델: JWT 만료 직전이면 SDK 가 session refresh 후 검증 — refresh 토큰 무효 시 null. 동작은 `getUser()` 와 등가지만 silent refresh 가 일어날 수 있음

### 후속 영향

- ESLint custom rule: `supabase.auth.getUser()` / `auth.getClaims()` 직접 호출을 ADR-0022 적용 제외 경로 6곳 화이트리스트 외에서 차단 (별도 chore PR)
- 모니터링: 머지 후 24h Vercel 로그에서 `over_request_rate_limit` count 추적. 0 또는 ↓↓ 면 success. 변화 없으면 asymmetric key 설정 점검 → 그래도 변화 없으면 ADR Alternative 1 (middleware + header) 로 escalate

## Verification

- `pnpm typecheck` — 좁힌 `AuthedUser` 타입과 호출자 11+ 곳 정합성 자동 검증
- `pnpm test` — `auth.spec.ts` 5 케이스 (정상, email 없음, error, 세션 없음, sub 비-string)
- Vercel preview 배포 후: 로그인 → 홈 → 챌린지 페이지 이동. Network 탭에서 `/auth/v1/user` 호출이 없는지 확인 (대신 `/.well-known/jwks.json` 만)
- 모니터링: 머지 후 24h `over_request_rate_limit` count
