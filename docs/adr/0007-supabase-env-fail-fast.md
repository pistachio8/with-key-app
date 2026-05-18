# ADR-0007: Supabase 클라이언트 env 누락 fail-fast

**Date**: 2026-05-18
**Status**: accepted
**Deciders**: pistachio8

## Context

2026-05-18 develop preview 환경에서 모바일·데스크탑 모두 매직링크 로그인이 `/login?error=auth`로 떨어지는 회귀가 발생했다. Vercel runtime logs에서 확인된 에러는 다음과 같다.

```
Error: Your project's URL and Key are required to create a Supabase client!
    at <unknown> (.next/server/chunks/ssr/_0aebzd.._.js:58:111)
    ...
```

이 메시지는 `@supabase/ssr` 라이브러리 내부에서 throw된 것으로, 호출한 surface(`server.ts`? `middleware.ts`?)와 어떤 변수(`URL`? `PUBLISHABLE_KEY`?)가 빠졌는지 stack에서 드러나지 않아 진단에 시간이 걸렸다.

근본 원인은 다음 세 가지가 겹친 것이다.

1. 코드는 `process.env.X!` non-null assertion으로 통과 — 빌드는 OK, runtime에 라이브러리가 빈 문자열을 받아 실패
2. `b82cba1 refactor(supabase): migrate env keys to sb_publishable/sb_secret` 시점에 변수 이름이 `*_ANON_KEY → *_PUBLISHABLE_KEY` / `*_SERVICE_ROLE_KEY → *_SECRET_KEY`로 바뀌었으나, Vercel scope별(Preview/Production/Development) 동기화는 사람 손에 의존
3. `admin.ts`는 이미 명시적 fail-fast 패턴(`if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin client")`)을 사용 중이었지만, `server.ts`/`middleware.ts`/`client.ts`는 통일되지 않은 채 `!` non-null assertion만 사용 — 일관성 부재가 회귀를 키움

## Decision

**`src/lib/supabase/{server,middleware,client}.ts`의 env 접근을 `admin.ts`와 동일한 명시적 fail-fast 패턴으로 통일한다.**

- `process.env.X!` 어설션 제거
- `if (!url) throw new Error("<VAR> is required for <surface>")` 형태로 surface별 메시지 구분
  - `server.ts` → `... is required for server client`
  - `middleware.ts` → `... is required for session middleware`
  - `client.ts` → `... is required for browser client`
  - `admin.ts` → `... is required for admin client` (기존 유지)
- import-time이 아닌 **call-time** throw — `admin.spec.ts`가 이미 보장하는 패턴과 정합

## Alternatives Considered

### 1. 공통 헬퍼로 추출 (`getSupabaseEnv()`)

- **Pros**: 4 surface의 env 읽기 로직을 한 곳에 모아 DRY 달성.
- **Cons**: 헬퍼 안에서는 호출 surface를 모르므로 동적 메시지가 필요해 가독성이 떨어진다. 4 파일·3~4줄 수준에 추상화를 끼우는 것은 과조성.
- **Why not**: Karpathy §2 단순함 우선. 4줄 중복이 헬퍼 추출보다 명확하다.

### 2. 빌드 시점 가드만 강화 (`scripts/check-env.ts`)

- **Pros**: 빌드를 막아 deploy 단계에서 잡힘.
- **Cons**: Vercel은 scope(Preview/Production/Development)가 분리되어 있어 빌드 시점 가드만으로 scope별 누락을 모두 잡지 못한다. 본 회귀도 빌드는 통과한 상태에서 발생.
- **Why not**: 보완적이고 이미 `pnpm check-env`가 존재. 본 결정은 runtime 가드를 추가해 두 층의 방어선을 만든다.

### 3. Type-safe env 라이브러리 도입 (`@t3-oss/env-nextjs` 등)

- **Pros**: zod 기반 env 스키마, build/runtime 둘 다 강제, 타입 안전.
- **Cons**: 새 의존성·학습 곡선, POC 범위 초과.
- **Why not**: 4 surface · 3줄씩이면 충분. POC 이후 정식 도입 검토.

## Consequences

### 긍정적

- Vercel runtime logs에 정확한 변수명 + surface가 즉시 식별됨 (예: `NEXT_PUBLIC_SUPABASE_URL is required for session middleware`).
- 동일 회귀 발생 시 진단 시간이 분 → 초 단위로 단축.
- `admin.ts`/`server.ts`/`middleware.ts`/`client.ts` 4 파일의 env 처리 패턴이 정합 — 멘탈 모델 단순화.

### 부정적 / 비용

- 4 파일에 3~4줄씩 중복 — `admin.ts` 기존 패턴에 정합화하므로 수용 가능.
- env 누락이 middleware에서 발생하면 모든 페이지가 500. 다만 그 상태는 이미 정상 동작 불가능 — silent하게 일부 요청만 실패하던 것보다 fail-loud가 안전하다.

### 후속 영향

- 본 ADR이 정한 메시지 포맷(`<VAR> is required for <surface>`)을 신규 Supabase surface(예: edge function용 client) 추가 시에도 동일하게 적용.
- 회귀 트리거(Vercel preview env 동기화 누락)는 코드 가드가 아닌 Vercel Dashboard에서 사람이 확인·복원해야 한다. 본 ADR의 가드는 보조선.
- 추후 type-safe env 라이브러리 도입 결정 시 본 ADR을 `superseded`로 마크.
