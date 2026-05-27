# ADR-0022-auth-getuser-standardization: auth.getUser 호출 표준화

**Date**: 2026-05-27
**Status**: proposed
**Deciders**: pistachio8

## Context

with-key 저장소에서 `supabase.auth.getUser()` 가 19곳에서 직접 호출되고 있다. 동일 request scope 안에서 layout · page · 자식 RSC 가 각자 호출하는 패턴이 누적되어 Supabase Auth API 압력 ↑.

2026-05-27 사용자 인증 피드에서 사진 미표시 증상 발생. 인과 사슬:

1. `AuthApiError: Request rate limit reached / status: 429 / code: over_request_rate_limit`
2. 429 → 세션 갱신 실패 → `supabase.storage.createSignedUrl()` 가 익명 세션으로 RLS 거부
3. `src/lib/db/reads/photo-signed-url.ts:26` 의 silent null fallback → `FeedItemView.photoSignedUrl = null`
4. UI 사진 미표시

Phase 5-3 hotfix (PR #113) 로 `src/lib/db/reads/group-detail.ts` 1곳만 `getAuthedUser()` 로 치환했으나, 잔여 18곳이 압력을 지속한다.

이미 `src/lib/supabase/auth.ts` 에 React `cache()` 기반 `getAuthedUser()` 헬퍼가 존재하지만 사용처가 일부 read 함수(`fetchGroupDetail`, `fetchChallengeDetail` 의 layout consumer)에 한정된다.

## Decision

**RSC page/layout 은 `requireUser()` 또는 `getAuthedUser()` 사용하고, `supabase.auth.getUser()` 직접 호출을 금지한다.**

- **인증 필요한 RSC** (`(app)/**/page.tsx`, `(app)/layout.tsx`): `requireUser()` 사용. 비로그인 시 자동 `redirect('/login')`
- **인증 선택적 RSC** (`(auth)/invite/[token]/page.tsx` 등): `getAuthedUser()` 사용 후 null 검사로 분기
- **`require-user.ts` 내부 구현**: `getAuthedUser()` 위에 재구성 — 두 헬퍼가 같은 React `cache()` 슬롯 공유

### 적용 대상 (13곳)

- RSC 12곳: `src/app/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/{recap,pledge,home,action,feed,me}/page.tsx`, `src/app/(app)/challenge/[id]/{recap,pledge,action}/page.tsx`, `src/app/(auth)/invite/[token]/page.tsx`
- 헬퍼 1곳: `src/lib/auth/require-user.ts`

### 적용 제외 (6곳, 사유 명시)

| 경로                                  | 사유                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/supabase/middleware.ts`      | Edge runtime · React tree 밖 — `React.cache()` 동작 안 함            |
| `src/app/auth/callback/route.ts`      | 매직링크 callback. 세션이 막 발급된 시점 → cached user 가 stale 위험 |
| `src/app/(auth)/login/_actions.ts`    | 로그인 직후 — 세션 변경 직후 fresh getUser 필요                      |
| `src/lib/auth/with-user.ts`           | Server Action 래퍼. 한 호출당 1회 — dedup ROI = 0. blast radius 우려 |
| `src/app/api/me/route.ts`             | 단발 API route — dedup 이득 없음                                     |
| `src/app/api/og/recap-card/route.tsx` | 단발 API route — 동일 사유                                           |

## Alternatives Considered

### 1. 모든 19곳 일괄 마이그레이션

- **Pros**: 일관성 ↑. 모든 호출이 표준 헬퍼 경유
- **Cons**: middleware 는 React tree 밖이라 `React.cache()` 동작 안 함 — 기술적 차단. auth-callback / login 은 세션 변경 직후 fresh getUser 가 필요해 cached 호출 시 stale 위험. with-user 는 Server Action 진입점이라 회귀 위험 광범위
- **Why not**: 일부 호출처는 dedup 목적과 무관한 구조적 이유로 직접 호출이 필요하다

### 2. 헬퍼만 patch + 호출자 코드 유지

- **Pros**: 마이그레이션 비용 최소. 호출자 코드 변경 0
- **Cons**: 호출자가 여전히 `supabase.auth.getUser()` 를 직접 호출하면 dedup 이 동작하지 않음 (`getAuthedUser` 는 React `cache()` 안에 있어야 dedup)
- **Why not**: 본 결정의 목적(429 압력 감소) 미달

### 3. ESLint custom rule 부터 도입

- **Pros**: 강제력 최고. 신규 RSC 의 직접 호출 차단
- **Cons**: custom plugin 작성 비용. 본 마이그레이션 PR 의 scope 확대
- **Why not**: ADR 컨벤션 + 코드리뷰 + 짧은 마이그레이션 기간 동안 회귀 방어 충분. ESLint rule 은 후속 chore PR 로 분리

## Consequences

### 긍정적

- 같은 request scope 안 layout + page + 자식 RSC 의 `auth.getUser()` 호출이 React `cache()` 로 dedup → Supabase Auth API 호출량 감소
- `over_request_rate_limit` (429) 발생 빈도 감소 → downstream 회귀(`createSignedUrl` 실패로 인한 사진 미표시) 완화
- RSC 작성 패턴 단순화: 4 줄 (`createClient + auth.getUser + if !user + redirect`) 을 1 줄 (`await requireUser()`) 로

### 부정적 / 비용

- `requireUser()` 의 반환 타입 (`{ id, email? }`) 이 좁아 미래 RSC 가 다른 user 필드 필요 시 시그니처 확장 필요 (현재 11곳 grep 결과 `id` / `email` 만 사용)
- React `cache()` 와 Supabase 의 미발견 stale 케이스 가능성. PR1 helper 변경의 production smoke 1-2h 로 우선 검증
- ADR 미고지 신규 작성자가 직접 `supabase.auth.getUser()` 추가 시 회귀 가능. 코드리뷰 + ESLint rule 후속 도입으로 방어

### 후속 영향

- **본 ADR 마이그레이션**: PR1 (helper + invite) → PR2 (RSC 11곳 일괄). plan: `docs/superpowers/plans/2026-05-27-auth-getuser-standardization.md`
- **ESLint custom rule chore PR**: `src/app/**/page.tsx`, `src/app/**/layout.tsx` 에서 `supabase.auth.getUser` 직접 호출 금지 규칙 추가
- **효과 측정 결과 ADR 갱신**: PR2 머지 후 7일 — Supabase 대시보드 Auth API 호출량 baseline ↔ post-merge 비교를 본 ADR Consequences 에 post-merge revision 으로 추가
