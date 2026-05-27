---
plan: 2026-05-27-auth-getuser-standardization
title: auth.getUser 호출 표준화 — getAuthedUser/requireUser 통일
author: pistachio8
date: 2026-05-27
status: draft
---

## 목표

`supabase.auth.getUser()` 직접 호출 19곳 중 RSC 12곳 + `require-user` 1곳을 React `cache()` 기반 `getAuthedUser()` 위에 통일.

배경: 2026-05-27 사용자 인증 피드에서 사진 미표시 증상 발생. 원인은 Supabase Auth 의 `over_request_rate_limit` (HTTP 429) — 같은 request scope 안 layout + page + 자식 RSC 가 각자 `auth.getUser()` 를 호출해 호출량 누적. Phase 5-3 hotfix(PR #113) 로 `fetchGroupDetail` 1곳만 `getAuthedUser` 로 치환했으나, 잔여 호출처가 광범위해 압력이 지속됨.

## 결정 요약 (grill-me 인터뷰 결과 — 2026-05-27)

| # | 항목 | 결정 |
| --- | --- | --- |
| Q1 | 범위 | RSC 12 + `require-user` 1 = 13곳. middleware · auth-callback · login Server Action · `with-user` · API route 제외 |
| Q2 | 호출 패턴 | 11곳 `requireUser()` (auth 필요), 1곳 `getAuthedUser()` (invite anon). `require-user` 내부 구현을 `getAuthedUser` 위에 재구성 |
| Q3 | 제외 명시 | middleware (React tree 밖, Edge runtime), auth-callback / login (세션 변경 직후 fresh getUser 필요), `with-user` / API route (단발 호출이라 dedup ROI = 0) |
| Q4 | PR 구조 | 2단계 PR — PR1: ADR + `require-user` 재구현 + invite page. PR2: RSC 11곳 일괄 |
| Q5 | 문서화 | ADR 1개 (`docs/adr/NNNN-auth-getuser-standardization.md`). plan/spec 은 PR 본문으로 대체 (본 plan 문서가 SoT) |
| Q6 | 회귀 방어 | ADR Consequences 에 컨벤션 명시. ESLint custom rule 은 후속 chore PR 로 분리 |
| Q7 | dogfood | PR1 머지 즉시 PR2 open + 1-2h production smoke |
| Q8 | 효과 측정 | Supabase 대시보드 Auth API 호출량 7일 baseline → 머지 후 7일 비교 |

## 영향 범위

### 변경 경로 (PR1 / PR2 분리)

**PR1 (foundation):**

- `src/lib/auth/require-user.ts` — 내부 구현을 `getAuthedUser()` 호출로 재구성. 외부 시그니처 (`Promise<{ id, email? }>`) 유지
- `src/app/(auth)/invite/[token]/page.tsx` — 직접 `createClient + auth.getUser` → `getAuthedUser()` 로 치환. anon 허용 동작 유지
- `docs/adr/NNNN-auth-getuser-standardization.md` — 신규 ADR

**PR2 (RSC 11곳 일괄):**

- `src/app/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/recap/page.tsx`
- `src/app/(app)/pledge/page.tsx`
- `src/app/(app)/home/page.tsx`
- `src/app/(app)/action/page.tsx`
- `src/app/(app)/feed/page.tsx`
- `src/app/(app)/me/page.tsx`
- `src/app/(app)/challenge/[id]/recap/page.tsx`
- `src/app/(app)/challenge/[id]/pledge/page.tsx`
- `src/app/(app)/challenge/[id]/action/page.tsx`

각 RSC 의 `createClient + auth.getUser + if (!user) redirect('/login')` 4 줄을 `await requireUser()` 1 줄로 치환. user 사용 패턴 사전 grep 으로 `id` / `email` 외 필드 없음을 확인 (Q2 호환성 점검).

### 변경 제외 경로 (명시)

| 경로 | 사유 |
| --- | --- |
| `src/lib/supabase/middleware.ts:34` | Edge runtime · React tree 밖 — `React.cache()` 동작 안 함 |
| `src/app/auth/callback/route.ts:59` | 매직링크 callback. 세션이 막 발급된 시점이라 cached user 가 stale 될 위험 |
| `src/app/(auth)/login/_actions.ts:84` | 로그인 직후 호출 — 세션 변경 직후 fresh getUser 필요 |
| `src/lib/auth/with-user.ts:13` | Server Action 래퍼. 한 호출당 본질 1회 — dedup ROI = 0. blast radius 우려 |
| `src/app/api/me/route.ts:8` | 단발 API route — dedup 이득 없음. 일관성만 위한 변경은 본 마이그레이션 범위 외 |
| `src/app/api/og/recap-card/route.tsx:30` | 단발 API route — 동일 사유 |

### 데이터/RLS 영향

**없음.** 인증 동작 자체는 동일하며 `getAuthedUser()` 도 `supabase.auth.getUser()` 를 그대로 위임. React `cache()` 가 같은 request scope 안에서 호출을 dedup 만 함 — 서로 다른 viewer 의 cache 충돌 없음 (React.cache 는 per-request).

### 외부 서비스

Supabase Auth API 호출량 ↓ (의도된 효과). 별도 통신 변경 없음.

### 재사용 후보

- `src/lib/supabase/auth.ts` — 이미 존재하는 `getAuthedUser` React `cache()` 래퍼. 재구현 없이 그대로 사용
- Phase 5-3 hotfix (PR #113) 의 `fetchGroupDetail` 변경 — 동일 패턴

## 작업 단계

### PR1 (브랜치: `chore/auth-getuser-pr1`)

1. **ADR 작성** — `pnpm new adr auth-getuser-standardization` 으로 scaffold 후 본문 작성. 검증: `pnpm validate:docs`
2. **`require-user.ts` 재구현** — `createClient + auth.getUser` 를 `getAuthedUser()` 호출로 교체. 시그니처 무변경. 검증: `pnpm typecheck`
3. **invite page 치환** — `src/app/(auth)/invite/[token]/page.tsx` 의 직접 호출을 `getAuthedUser()` 로. anon 동작 (preview 노출) 유지 확인. 검증: `pnpm test`
4. **통합 검증** — `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:docs && NEXT_BUILD_WORKERS=1 pnpm build` 모두 PASS
5. **수동 smoke** — dev 서버에서 `/me/challenges` (이미 `requireUser` 사용 — helper 회귀 즉시 감지), `/invite/[token]` (anon · auth 양쪽 진입)
6. **커밋 + 푸시 + PR** — base `develop`. PR 본문에 결정 요약 + 검증 결과
7. **1-2h production smoke** 후 PR2 open

### PR2 (브랜치: `chore/auth-getuser-pr2`)

PR1 머지 후 즉시 진행. PR1 의 helper 안정성 확인 후.

1. **`(app)/layout.tsx` 치환** — `createClient + auth.getUser + redirect` 를 `await requireUser()` 로. `users.display_name` 후속 쿼리는 별도 `createClient()` 호출 유지 (read 와 auth 분리)
2. **`(app)/**/page.tsx` 10곳 일괄 치환** — 동일 패턴
3. **page 별 호환성 재확인** — `user.id` / `user.email` 외 필드 사용 없음 (PR 본문에 grep 결과 첨부)
4. **통합 검증** — 자동 검증 게이트 + 수동 smoke (각 page 진입 → user 정보 정상 노출 확인)
5. **커밋 + 푸시 + PR** — base `develop`

### Sub-PR (후속, 본 plan 외)

- **ESLint custom rule chore PR** — `src/app/**/page.tsx`, `src/app/**/layout.tsx` 에서 `supabase.auth.getUser` 직접 호출 금지. 회귀 방어
- **효과 측정 결과 ADR 업데이트** — Supabase 대시보드 baseline ↔ post-merge 비교 결과를 ADR Consequences 에 post-merge revision

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
NEXT_BUILD_WORKERS=1 pnpm build
```

수동 확인 항목:

- [ ] PR1: `/me/challenges` (require-user 회귀 감지 path), `/invite/[token]` anon + auth 양쪽
- [ ] PR2: `(app)/**` 전체 RSC 진입 시 user 정보 노출 확인 (특히 `/me` 의 `user.email`)
- [ ] PR2 머지 후 Vercel 로그에서 `over_request_rate_limit` 빈도 감소 확인 (정성)
- [ ] PR2 머지 후 7일 — Supabase 대시보드 Auth API 호출량 baseline ↔ post-merge 비교

## 리스크 / 미해결

| 리스크 | 등급 | 대응 |
| --- | --- | --- |
| React `cache()` + Supabase auth 의 미발견 stale 케이스 | 중 | PR1 helper 변경의 production smoke 1-2h 로 확인. `/me/challenges` 가 이미 `requireUser` path 라 즉시 감지 가능 |
| `requireUser()` 의 `{ id, email }` 좁은 타입이 미래 RSC 의 추가 user 필드 요구 차단 | 낮음 | 향후 필요 시 `requireUser` 시그니처 확장. 현재 11곳 grep 결과 `id` / `email` 만 사용 |
| dedup 으로 인한 PR2 머지 후 page-level 동작 변경 (예: layout 의 redirect 가 page 의 redirect 보다 우선) | 낮음 | layout 이 먼저 redirect 하므로 child page 의 `requireUser()` 도 동일 path 로 redirect — 의도된 동작 |
| ESLint rule 미도입 상태에서 신규 RSC 작성자가 직접 호출 추가 → 회귀 | 중 | ADR Consequences 에 컨벤션 명시 + 코드리뷰. 장기적으로 ESLint chore PR 진행 |
| 효과 측정 baseline 캡처 누락 시 retrospective 불가 | 낮음 | PR1 open 직전에 Supabase 대시보드 7일 metric 스크린샷 저장 |

## 참고

- ADR (PR1 동봉): `docs/adr/NNNN-auth-getuser-standardization.md`
- 관련 hotfix: PR #113 (`fetchGroupDetail` 의 `auth.getUser` → `getAuthedUser`)
- 관련 plan: `docs/superpowers/plans/2026-05-26-cache-phase5-expansion.md` (Phase 5 cache 도입 — 본 마이그레이션의 motivation)
- 헬퍼 SoT: `src/lib/supabase/auth.ts` (`getAuthedUser`), `src/lib/auth/require-user.ts` (`requireUser`)
