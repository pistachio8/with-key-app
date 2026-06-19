---
Task: EVAL-0034
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0033] — 서버 코어(mintDevToken·isDevLoginEnabled) 완성 선행.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0034: dev-login 라우트 확장 — 게이트 교체 + email · format=token 분기

> WP2 (`feat/dev-login-mode`). 3 reviewer 공통 선결과제: `NODE_ENV` 게이트 → `DEV_LOGIN_ENABLED` 교체. spec §5.2.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) WP2
- Parent Work Package: `feat/dev-login-mode` (WP2)

## Goal

`apps/web/src/app/auth/dev-login/route.ts` 가 세 경로를 모두 처리한다: ① `?token_hash=...` 기존 경로 유지(CLI 호환), ② `?email=...&next=/home` → mintDevToken → verifyOtp → 쿠키 → redirect (web 메뉴 경로), ③ `?email=...&format=token` → mintDevToken → JSON `{ hashed_token }` 응답 (RN 메뉴 경로). **핵심**: 기존 `NODE_ENV === 'production'` 게이트를 `DEV_LOGIN_ENABLED !== 'true'` 로 교체(추가가 아님) — Vercel Preview도 `NODE_ENV=production`이라 기존 게이트가 Preview를 404 처리하는 버그 제거.

## Source Files to Inspect

- `apps/web/src/app/auth/dev-login/route.ts` — 현재 구현(NODE_ENV 게이트·token_hash 경로)
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §5.2

## Target Files

- `apps/web/src/app/auth/dev-login/route.ts` — NODE_ENV 게이트 교체 + email·format=token 분기 추가
- `apps/web/src/app/auth/dev-login/` — 신규 route.spec.ts (4경로 unit 테스트)

## Requirements

- 기존 `process.env.NODE_ENV === 'production'` 조건을 `process.env.DEV_LOGIN_ENABLED !== 'true'` 로 **교체** (추가 분기 아님 — 기존 줄 제거).
- disabled 시 `NextResponse('Not found', { status: 404 })`.
- `?token_hash=...`: 기존 verifyOtp + redirect 동작 보존.
- `?email=...&format=token`: mintDevToken → JSON `{ hashed_token: string }` 응답, Content-Type `application/json`.
- `?email=...` (format 없음): mintDevToken → verifyOtp → Set-Cookie → `next` redirect.
- mintDevToken에서 `{ status: 404 }` throw → 404 응답, `{ status: 400 }` throw → 400 응답, 기타 → 502.
- unit 테스트: 4경로(token_hash·email·format=token·disabled) 각각.

## Non-goals

- `mintDevToken` 구현 — EVAL-0033.
- web·RN UI 메뉴 — EVAL-0035·EVAL-0036.
- RN Protection Bypass 헤더 검증 — Vercel 엣지 담당, 라우트 코드 불필요.

## Acceptance Criteria

| 기준                      | 검증 방법                                         |
| ------------------------- | ------------------------------------------------- |
| NODE_ENV 게이트 제거 확인 | grep 'NODE_ENV' route.ts → 빈 결과                |
| disabled → 404            | DEV_LOGIN_ENABLED 미설정 mock → 404 응답          |
| token_hash 경로 보존      | 기존 동작 회귀 없음 — verifyOtp mock 통과         |
| email 경로 → redirect     | mintDevToken mock + verifyOtp mock → 302 redirect |
| format=token → JSON       | mintDevToken mock → `{ hashed_token }` JSON 응답  |
| typecheck·lint            | `pnpm typecheck && pnpm lint` PASS                |
| harness traceability      | `pnpm harness:check` PASS                         |

## Verification Commands

```bash
pnpm harness:context EVAL-0034
pnpm typecheck && pnpm lint
pnpm test -- dev-login
pnpm harness:check
```

## Expected Output Summary

`NODE_ENV` 게이트 교체 이유(Vercel Preview도 `NODE_ENV=production`), 3분기 라우트 로직, mintDevToken 에러 status → HTTP 코드 매핑 방식, 4경로 unit 테스트 구성을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- 4경로 unit 테스트 green + NODE_ENV 제거 grep 확인 + typecheck·lint PASS + `pnpm harness:check` PASS.
- pass@3 미달 → 분기별(disabled/token_hash/email/format=token) 단위 분할.
