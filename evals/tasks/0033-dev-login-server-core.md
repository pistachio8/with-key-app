---
Task: EVAL-0033
Track: greenfield
Kind: migration
Status: done
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0033: dev-login 서버 코어 — isDevLoginEnabled · DEV_LOGIN_EMAILS allowlist · mintDevToken

> WP1 (`feat/dev-login-mode`). 라우트·메뉴의 선행 기반. spec §5.1 + reviewer 교정(hashed_token 필드명·allowlist-only 방어선).

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) WP1
- Parent Work Package: `feat/dev-login-mode` (WP1)

## Goal

`apps/web/src/lib/auth/dev-login.ts` 가 신규 생성되어 세 책임을 단일 모듈에서 담당한다: ① `isDevLoginEnabled()` — `DEV_LOGIN_ENABLED === 'true'` 여부 반환, ② `DEV_EMAILS` 파싱 — `DEV_LOGIN_EMAILS` env를 `,` 분리·trim·filter, ③ `mintDevToken(email)` — allowlist 확인 → `adminClient().auth.admin.generateLink({ type:'magiclink', email })` → `data.properties.hashed_token` 반환. allowlist 불일치는 400 throw, disabled 시 404 throw. unit 테스트로 각 경로가 검증된다.

## Source Files to Inspect

- `apps/web/src/app/auth/dev-login/route.ts` — 기존 패턴 및 `createClient` import
- `apps/web/scripts/dev-login-link.mjs` — `data.properties.hashed_token` 필드명 패턴(line ~50)
- `apps/web/src/lib/supabase/server.ts` — `adminClient` export 확인
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §5.1

## Target Files

- `apps/web/src/lib/auth/` — 신규 dev-login.ts (`isDevLoginEnabled`·`DEV_EMAILS`·`mintDevToken`) + dev-login.spec.ts (3경로 unit 테스트)

## Requirements

- `isDevLoginEnabled()`: `process.env.DEV_LOGIN_ENABLED === 'true'` 반환.
- `DEV_EMAILS`: `process.env.DEV_LOGIN_EMAILS ?? ''` → `.split(',').map(s=>s.trim()).filter(Boolean)`.
- `mintDevToken(email: string): Promise<string>`: ① disabled → `throw { status: 404 }` (라우트가 NextResponse 404 변환) ② 비allowlist → `throw { status: 400, message: 'email not in allowlist' }` ③ `adminClient().auth.admin.generateLink({ type:'magiclink', email })` → 반환 필드 `data.properties.hashed_token` (token_hash 아님).
- unit 테스트: allowlist 불일치 거부 · disabled 거부 · admin generateLink mock → hashed_token 반환.
- token_hash·hashed_token 값을 `console.log`에 출력하지 않는다.

## Non-goals

- 라우트 분기·응답 전송 로직 — EVAL-0034.
- web·RN UI 메뉴 — EVAL-0035·EVAL-0036.
- seed 스크립트 — EVAL-0037.
- `DEV_LOGIN_USER_IDS`를 통한 `getUserById` hardening — 선택적 후속, 이 task 범위 밖.

## Acceptance Criteria

| 기준                          | 검증 방법                                                          |
| ----------------------------- | ------------------------------------------------------------------ |
| disabled → 404 throw          | `isDevLoginEnabled()=false` mock → mintDevToken throw {status:404} |
| 비allowlist → 400 throw       | DEV_EMAILS=['a@b.test'] + email='x@b.test' → throw {status:400}    |
| allowlist → hashed_token 반환 | generateLink mock → data.properties.hashed_token 값 반환 확인      |
| token 값 미로깅               | grep console.log dev-login.ts → 빈 결과                            |
| typecheck·lint                | `pnpm typecheck && pnpm lint` PASS                                 |
| harness traceability          | `pnpm harness:check` PASS                                          |

## Verification Commands

```bash
pnpm harness:context EVAL-0033
pnpm typecheck && pnpm lint
pnpm test -- dev-login
pnpm harness:check
```

## Expected Output Summary

`apps/web/src/lib/auth/dev-login.ts` 생성 완료, 세 책임(isDevLoginEnabled·DEV_EMAILS·mintDevToken)의 구현 결정(특히 `data.properties.hashed_token` 필드명 채택 근거), allowlist-only 방어선이 "존재 확인 없이 generateLink 실행"과 어떻게 결합되는지, unit 테스트 3경로를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? (`src/lib/auth/` 신규 여부 확인)
2. New naming convention? No.
3. New dependency? (`adminClient` import 경로 이미 존재 여부 확인)
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- 3경로 unit 테스트 green + typecheck·lint PASS + `pnpm harness:check` PASS.
- pass@3 미달 → isDevLoginEnabled·mintDevToken 분리 task로 split.
