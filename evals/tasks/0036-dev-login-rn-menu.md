---
Task: EVAL-0036
Track: greenfield
Kind: migration
Status: done
Depends-on: [task:EVAL-0034] — 라우트 확장(format=token 분기) 완성 선행 — RN이 호출할 JSON 엔드포인트가 동작해야 함.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0036: RN dev 로그인 메뉴 — kicker long-press + bypass 헤더 fetch + app.config extra

> WP4 (`feat/dev-login-mode`). RN 숨긴 메뉴 신규 + login.tsx kicker 연결 + app.config.ts dev-only extra 주입. spec §5.4·§8(비-JSON 응답 가드).

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) WP4
- Parent Work Package: `feat/dev-login-mode` (WP4)

## Goal

`dev-login-sheet.tsx` 가 `__DEV__` 블록 내에서만 렌더된다. `login.tsx` 의 "fromwith" kicker(`styles.kicker`, line ~74)에 `onLongPress` 를 달아 Sheet를 연다. 항목 탭 시 Preview 엔드포인트에 `x-vercel-protection-bypass` 헤더를 포함해 fetch하고, **응답이 JSON인지 먼저 확인**한 뒤 `{ hashed_token }` 을 `verifyMagicLinkToken` 에 전달한다. `app.config.ts` 의 `extra` 블록은 `appVariant === 'dev'` 일 때만 `devLoginUrl`·`vercelBypass` 를 주입한다. prod 번들에는 이 값들이 존재하지 않는다.

## Source Files to Inspect

- `apps/mobile/src/app/(auth)/login.tsx` — kicker 위치(line ~74, `styles.kicker`), 현재 구조
- `apps/mobile/src/features/auth/api/auth-service.ts` — `verifyMagicLinkToken(tokenHash)` 시그니처(line ~85)
- `apps/mobile/app.config.ts` — `extra` 블록 구조, `bffBaseUrl` 패턴(line ~136~141), `appVariant` 분기 패턴
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §5.4·§8

## Target Files

- `apps/mobile/src/app/(auth)/login.tsx` — kicker onLongPress + DevLoginSheet 조건 import (외과적)
- `apps/mobile/app.config.ts` — extra에 devLoginUrl·vercelBypass (`appVariant==='dev'` 조건 주입)
- `apps/mobile/src/features/auth/` — 신규 dev/ 디렉토리 + dev-login-sheet.tsx (**DEV** 조건 메뉴)

## Requirements

- `dev-login-sheet.tsx`:
  - `if (!__DEV__) return null` — release 빌드 strip.
  - `DEV_ACCOUNTS`: `[{ label:'멤버·진행중', email:'member-active@fromwith.test' }, { label:'잔액 있음', email:'balance@fromwith.test' }]`.
  - 값 읽기: `Constants.expoConfig?.extra?.devLoginUrl`, `Constants.expoConfig?.extra?.vercelBypass`.
  - fetch 로직:
    1. `devLoginUrl` 미존재 시 에러 토스트 + return.
    2. `res = await fetch(\`\${devLoginUrl}/auth/dev-login?email=\${encodeURIComponent(email)}&format=token\`, { headers: { 'x-vercel-protection-bypass': vercelBypass ?? '' } })`.
    3. `!res.ok` → 에러 토스트(status 코드 포함) + return.
    4. `contentType = res.headers.get('content-type')`, `!contentType?.includes('application/json')` → 에러 토스트("비-JSON 응답") + return.
    5. `const { hashed_token } = await res.json()`.
    6. `verifyMagicLinkToken(hashed_token)` → 세션 교환.
  - 모든 catch에 에러 토스트.
- `login.tsx`: "fromwith" kicker 텍스트(`styles.kicker`)에 `onLongPress={() => setDevSheetOpen(true)}` — state 1개 추가, `__DEV__` 조건으로 `DevLoginSheet` import·render.
- `app.config.ts`: `extra` 블록에 `appVariant === 'dev'` 조건 추가:
  ```ts
  ...(variant === 'dev' ? {
    devLoginUrl: process.env.EXPO_PUBLIC_DEV_LOGIN_URL,
    vercelBypass: process.env.EXPO_PUBLIC_VERCEL_BYPASS,
  } : {}),
  ```
  — prod·staging variant 에는 키 자체가 없어 번들 인라인 없음.

## Non-goals

- web 메뉴 — EVAL-0035.
- Vercel Protection Bypass 토큰 발급 — ops 게이트(사람).
- E2E 자동 테스트 — manual(spec §9).
- `verifyMagicLinkToken` 구현 변경 — 기존 그대로.

## Acceptance Criteria

| 기준                                  | 검증 방법                                              |
| ------------------------------------- | ------------------------------------------------------ |
| `__DEV__` 조건 + null 반환            | 코드 구조 확인                                         |
| 비-JSON 응답 가드 (content-type 검사) | fetch 로직 코드 리뷰                                   |
| res.ok 실패 → 에러 토스트 + return    | 코드 구조 확인                                         |
| app.config variant=dev 조건 주입      | grep 'devLoginUrl' app.config.ts → variant=dev 블록 내 |
| prod/staging extra에 devLoginUrl 없음 | variant=prod 경로 코드 확인                            |
| typecheck·lint                        | `pnpm typecheck && pnpm lint` PASS                     |
| harness traceability                  | `pnpm harness:check` PASS                              |

## Verification Commands

```bash
pnpm harness:context EVAL-0036
pnpm typecheck && pnpm lint
pnpm harness:check
```

## Expected Output Summary

`dev-login-sheet.tsx` 의 `__DEV__` strip 근거, fetch 5단계 에러 가드 구조(비-JSON 응답 포함), `app.config.ts` extra variant 분기가 prod 번들 누출을 막는 방식, `login.tsx` 외과적 변경 범위(kicker onLongPress + state 1개)를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? `apps/mobile/src/features/auth/dev/` 신규 디렉토리.
2. New naming convention? No.
3. New dependency? `expo-constants` 이미 사용 여부 확인.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- typecheck·lint PASS + content-type 가드 코드 확인 + prod extra 누출 없음 확인 + `pnpm harness:check` PASS.
- pass@3 미달 → fetch 로직·app.config 분리.
