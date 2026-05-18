# ADR-0007: develop preview 매직링크 회귀 복구 — env 가드 + token_hash flow 전환

**Date**: 2026-05-18
**Status**: accepted (revised 2026-05-18 — token_hash flow 전환 추가)
**Deciders**: pistachio8

## Context

2026-05-18 develop preview 환경에서 모바일·데스크탑 모두 매직링크 로그인이 `/login?error=auth`로 떨어지는 회귀가 발생했다. 진단 과정에서 두 단계의 결함이 드러났다.

### 1차 진단 — 라이브러리 throw 가시성 부족

Vercel runtime logs에서 처음 확인된 에러:

```
Error: Your project's URL and Key are required to create a Supabase client!
    at <unknown> (.next/server/chunks/ssr/_0aebzd.._.js:58:111)
    ...
```

이 메시지는 `@supabase/ssr` 라이브러리 내부에서 throw된 것으로, 호출한 surface(`server.ts`? `middleware.ts`?)와 어떤 변수(`URL`? `PUBLISHABLE_KEY`?)가 빠졌는지 stack에서 드러나지 않아 진단에 시간이 걸렸다.

근본 원인은 다음 세 가지가 겹친 것이다.

1. 코드는 `process.env.X!` non-null assertion으로 통과 — 빌드는 OK, runtime에 라이브러리가 빈 문자열을 받아 실패
2. `b82cba1 refactor(supabase): migrate env keys to sb_publishable/sb_secret` 시점에 변수 이름이 `*_ANON_KEY → *_PUBLISHABLE_KEY` / `*_SERVICE_ROLE_KEY → *_SECRET_KEY`로 바뀌었으나, Vercel scope별(Preview/Production/Development) 동기화는 사람 손에 의존
3. `admin.ts`는 이미 명시적 fail-fast 패턴을 사용 중이었지만, `server.ts`/`middleware.ts`/`client.ts`는 통일되지 않은 채 `!` non-null assertion만 사용 — 일관성 부재가 회귀를 키움

### 2차 진단 — PKCE flow의 모바일 한계

env 가드 추가 후 Vercel build cache 무력화 redeploy를 거치자 진짜 에러가 노출됐다(빌드 캐시가 새 가드 코드의 컴파일을 건너뛰어 1차 메시지가 한 번 더 등장 → "Use existing Build Cache" 해제 redeploy로 해소).

```
[auth/callback] exchange failed: PKCE code verifier not found in storage.
This can happen if the auth flow was initiated in a different browser or device,
or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.),
use @supabase/ssr on both the server and client to store the code verifier in cookies.
```

매직링크는 본질적으로 "out-of-band channel"이라 요청한 브라우저와 클릭한 브라우저가 다른 경우가 정상 사용 패턴이다. 특히 모바일에서 메일 앱(Apple Mail / Gmail 등)이 인앱 브라우저로 링크를 여는 경우 PKCE verifier 쿠키 jar가 격리돼 `exchangeCodeForSession`이 무조건 실패한다.

기존 코드는 `signInWithOtp`(PKCE 기본) + `exchangeCodeForSession`(verifier 의존) 조합으로 모바일에서 구조적으로 작동 불가했다. 한때 매직링크가 작동했던 케이스는 desktop 동일 브라우저에서 요청·클릭한 경우에 한정.

## Decision

본 ADR은 한 인시던트에서 발견된 두 결함의 fix를 한 묶음으로 채택한다.

### 결정 1 — `src/lib/supabase/*` env 가드 fail-fast 통일

`src/lib/supabase/{server,middleware,client}.ts`의 env 접근을 `admin.ts`와 동일한 명시적 fail-fast 패턴으로 통일한다.

- `process.env.X!` 어설션 제거
- `if (!url) throw new Error("<VAR> is required for <surface>")` 형태로 surface별 메시지 구분
  - `server.ts` → `... is required for server client`
  - `middleware.ts` → `... is required for session middleware`
  - `client.ts` → `... is required for browser client`
  - `admin.ts` → `... is required for admin client` (기존 유지)
- import-time이 아닌 **call-time** throw — `admin.spec.ts`가 이미 보장하는 패턴과 정합

### 결정 2 — `/auth/callback`을 token_hash flow로 전환 (호환 분기 유지)

`/auth/callback`이 `token_hash` 또는 `code` 둘 다 받아 처리한다.

- `token_hash`가 있으면 `verifyOtp({ type: "email", token_hash })` 우선 — Supabase 공식 SSR 권장. verifier 쿠키 의존 없음 → 모바일 cross-browser/in-app browser 강건.
- `token_hash`가 없고 `code`가 있으면 `exchangeCodeForSession(code)` fallback — 옛 PKCE 링크 마이그레이션 안전망. 1시간 만료 이내의 옛 발송 링크가 깨지지 않게 함.
- 둘 다 없으면 `/login?error=auth`로 fail.

사용자 측 작업(코드 변경과 동시 진행): Supabase Dashboard → Auth → Email Templates → **Magic Link**의 link target을 `{{ .ConfirmationURL }}`에서 `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`로 변경한다. `{{ .RedirectTo }}`는 `signInWithOtp`의 `emailRedirectTo`로 넘긴 동적 origin이라 Preview에서도 정확.

POC 안정화 후 PKCE branch(`exchangeCodeForSession`)를 별도 PR로 제거한다.

## Alternatives Considered

### 결정 1에 대한 대안

#### A. 공통 헬퍼로 추출 (`getSupabaseEnv()`)

- **Pros**: 4 surface의 env 읽기 로직을 한 곳에 모아 DRY 달성.
- **Cons**: 헬퍼 안에서는 호출 surface를 모르므로 동적 메시지가 필요해 가독성이 떨어진다.
- **Why not**: Karpathy §2 단순함 우선. 4줄 중복이 헬퍼 추출보다 명확하다.

#### B. 빌드 시점 가드만 강화 (`scripts/check-env.ts`)

- **Pros**: 빌드를 막아 deploy 단계에서 잡힘.
- **Cons**: Vercel은 scope(Preview/Production/Development)가 분리되어 있어 빌드 시점 가드만으로 scope별 누락을 모두 잡지 못한다.
- **Why not**: 보완적이고 이미 `pnpm check-env`가 존재. 본 결정은 runtime 가드를 추가해 두 층의 방어선을 만든다.

#### C. Type-safe env 라이브러리 도입 (`@t3-oss/env-nextjs` 등)

- **Pros**: zod 기반 env 스키마, build/runtime 둘 다 강제, 타입 안전.
- **Cons**: 새 의존성·학습 곡선, POC 범위 초과.
- **Why not**: 4 surface · 3줄씩이면 충분. POC 이후 정식 도입 검토.

### 결정 2에 대한 대안

#### D. 단순 교체 (PKCE branch 제거, token_hash만 처리)

- **Pros**: 코드 더 단순, 한 가지 멘탈 모델.
- **Cons**: 코드 머지와 Supabase Dashboard 이메일 템플릿 변경 사이 시간차에 매직링크가 일시적으로 깨짐. 이미 발송된 PKCE 링크(1시간 만료)는 invalid.
- **Why not**: POC 베타라도 매직링크 단속적 다운타임이 사용자 신뢰를 깎는다. 5줄 추가 비용 < 동기화 리스크 회피의 가치.

#### E. 새 `/auth/confirm` 라우트 신설 + `/auth/callback`은 PKCE 유지

- **Pros**: Supabase 공식 가이드 패턴.
- **Cons**: PKCE는 어차피 모바일에서 fail이라 살릴 가치 없음. 이중 라우트 운영 부담.
- **Why not**: 단일 경로 + 호환 분기가 깔끔하다.

#### F. PKCE flow 유지 (전환 안 함)

- **Pros**: 변경 없음.
- **Cons**: 모바일에서 구조적으로 작동 불가 — 모바일 메일 앱 인앱 브라우저 cookie jar 격리.
- **Why not**: 모바일 PWA POC가 모바일에서 안 되면 의미가 없다.

## token_hash flow의 보안 평가

PKCE는 OAuth provider(Google/카카오 등 social login)에는 여전히 정답이다 — code intercept 시 verifier binding이 추가 layer를 제공. 다만 매직링크는 "이메일 채널 자체의 안전성"에 보안이 본질적으로 의존하는 컨텍스트라, **token_hash + single-use + TTL + email rate limit** 조합이 표준이며 Supabase가 SSR magic link에 공식 권장하는 패턴이다. POC 이후에도 유지 가능.

- `verifyOtp`의 token_hash는 single-use — 한 번 사용 후 폐기
- Supabase는 default로 매직링크 TTL 1시간 (Dashboard에서 더 짧게 조정 가능)
- `requestMagicLink` action에 rate limit 처리 이미 구현(`isRateLimitError`) — 유지
- HTTPS/TLS 보호는 Vercel 기본
- Cookie SameSite=Lax는 `@supabase/ssr` 기본

이후 social login(카카오·구글 등) 추가 시 그 경로는 별도 PKCE flow로 분리 운영한다 — Supabase는 매직링크 token_hash flow와 OAuth PKCE flow를 동시 사용 가능.

## Consequences

### 긍정적

- 모바일 cross-browser/in-app browser 매직링크 정상 작동
- Vercel runtime logs에 정확한 변수명 + surface 식별 (`NEXT_PUBLIC_SUPABASE_URL is required for session middleware`) — 회귀 시 진단 시간이 분 → 초
- Supabase 공식 SSR 권장 패턴과 정렬 — POC 이후에도 유지 가능
- `admin.ts`/`server.ts`/`middleware.ts`/`client.ts` env 처리 패턴 일관

### 부정적 / 비용

- 호환 분기 임시 유지 — PKCE branch와 token_hash branch 코드 공존. POC 안정화 후 cleanup task 1개.
- 이메일 템플릿 변경이 Supabase Dashboard에서 사람 손으로 별도 작업 — 본 ADR 머지와 동시 진행 필요.
- 4 파일에 3~4줄씩 env 가드 중복 — `admin.ts` 기존 패턴 정합이라 수용 가능.
- env 누락이 middleware에서 throw되면 모든 페이지가 500이지만, 그 상태는 이미 정상 동작 불가능 — silent 일부 실패보다 fail-loud가 안전.

### 후속 영향

- **즉시**: Supabase Dashboard → Auth → Email Templates → Magic Link 본문의 `{{ .ConfirmationURL }}`을 `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`로 교체.
- **POC 안정화 후**: 별도 PR로 `/auth/callback`의 PKCE branch(`exchangeCodeForSession`) 제거 — 호환 분기 단순화.
- **신규 supabase surface**: 본 ADR이 정한 메시지 포맷(`<VAR> is required for <surface>`)을 신규 client(예: edge function용) 추가 시 동일 적용.
- **social login 추가 시**: 그 경로는 별도 OAuth PKCE flow로 wire — 본 ADR은 magic link 전용 결정.
- **type-safe env 라이브러리 도입 결정 시**: 본 ADR을 `superseded`로 마크.
