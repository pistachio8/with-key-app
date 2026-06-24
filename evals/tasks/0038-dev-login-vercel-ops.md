---
Task: EVAL-0038
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0033] [task:EVAL-0034] [task:EVAL-0035] [task:EVAL-0036] [task:EVAL-0037] — 코드 WP(0033~0036) 전원 완료. seed 실행(0037)은 PO 승인 대기 — seed된 계정 없이는 수동 E2E(AC·Stop Condition)가 통과 불가하므로 0037 해제까지 게이트 유지.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0038: Vercel ops 게이트 — Preview env 등록 + Protection Bypass 발급 + E2E 실측

> 사람 게이트 task — 자율 구현 불가. 코드 WP(EVAL-0033~0037) PR 머지 후 ops 담당자가 직접 수행. spec §4·§9(manual E2E)·D9.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) OPS
- Parent Work Package: `feat/dev-login-mode` (OPS)

## Goal

Vercel 대시보드에서 Preview env scope에 필요한 변수가 등록되고, Protection Bypass 토큰이 발급된다. 웹 Preview에서 5탭 제스처 → 계정 선택 → 로그인이 성공하고, RN dev client 실기기에서 kicker long-press → 계정 선택 → 로그인이 성공한다. Production env에는 어떤 dev-login 관련 변수도 등록되지 않음을 확인한다.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §4·§7·§9·D9
- `apps/web/.env.example` — 등록할 변수 목록(EVAL-0035 산출물)
- `apps/mobile/app.config.ts` — `EXPO_PUBLIC_DEV_LOGIN_URL`·`EXPO_PUBLIC_VERCEL_BYPASS` 참조처

## Target Files

- `apps/web/.env.example` — Vercel env 등록 완료 후 실측값 주석 보강 (선택)
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` — ops 완료 상태 메모(선택)

## Requirements

**Vercel Preview env 등록** (scope: Preview only — Production 절대 미등록):

| 변수                    | 값                                                  | 비고                        |
| ----------------------- | --------------------------------------------------- | --------------------------- |
| `DEV_LOGIN_ENABLED`     | `true`                                              | 서버 토큰 엔드포인트 활성화 |
| `NEXT_PUBLIC_DEV_LOGIN` | `1`                                                 | web 숨긴 메뉴 노출          |
| `DEV_LOGIN_EMAILS`      | `member-active@fromwith.test,balance@fromwith.test` | 콤마 분리 allowlist         |

**Vercel Protection Bypass 토큰 발급**:

- Project Settings → Deployment Protection → "Protection Bypass for Automation" 에서 토큰 생성.
- 발급된 토큰 = `EXPO_PUBLIC_VERCEL_BYPASS` 값으로 RN 빌드 시 주입(dev variant 전용).

**RN dev 빌드 env 주입**:

- `EXPO_PUBLIC_DEV_LOGIN_URL`: develop 브랜치 안정 alias URL (per-deploy 해시 아님).
- `EXPO_PUBLIC_VERCEL_BYPASS`: 위에서 발급한 bypass 토큰.

**Production env 확인**:

- Vercel 대시보드 Production scope에서 `DEV_LOGIN_ENABLED` 미존재 확인.

**수동 E2E**:

1. 웹: Preview URL → 로그인 화면 → 로고 5탭 → Sheet 열림 → "멤버·진행중" 탭 → `/home` 이동 확인.
2. RN: dev client 실기기 → 로그인 화면 → "fromwith" kicker long-press → Sheet 열림 → 계정 탭 → 세션 교환 → 홈 이동 확인.

**Supabase seed 실행** (EVAL-0037 선행):

- `node apps/web/scripts/dev-seed-accounts.mjs` — linked 공유 프로젝트에 1회 실행.
- append-only ledger라 비가역 — 실행 전 금액·UUID 재확인.

## Non-goals

- 코드 구현 — EVAL-0033~0037.
- CI 자동 seed — 후속.
- Production env에 dev-login 변수 등록 — 금지.

## Acceptance Criteria

| 기준                                  | 검증 방법                                 |
| ------------------------------------- | ----------------------------------------- |
| Preview env 3개 변수 등록             | Vercel 대시보드 직접 확인                 |
| Production env DEV_LOGIN_ENABLED 없음 | Vercel 대시보드 Production scope 확인     |
| Protection Bypass 토큰 발급           | 토큰 값 RN 빌드 env에 주입 확인           |
| 웹 E2E: 5탭 → 로그인 성공             | 수동 실측 1회                             |
| RN E2E: long-press → 로그인 성공      | 실기기 수동 실측 1회                      |
| seed 실행 완료                        | 스크립트 출력 확인(skip 포함 멱등 리포트) |

## Verification Commands

```bash
# 모두 수동 — CLI 없음
# 1. Vercel 대시보드 Preview env 확인
# 2. node apps/web/scripts/dev-seed-accounts.mjs
# 3. 웹 Preview 수동 E2E
# 4. RN dev client 실기기 수동 E2E
```

## Expected Output Summary

Vercel env 등록 완료 스크린샷(또는 확인 메모), Protection Bypass 토큰 발급 완료, seed 스크립트 실행 결과 요약, 웹·RN E2E 각 성공 확인 내역을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- Preview env 3개 등록 확인 + Production 미등록 확인 + bypass 토큰 발급 + seed 실행 완료 + 웹·RN E2E 각 1회 성공.
