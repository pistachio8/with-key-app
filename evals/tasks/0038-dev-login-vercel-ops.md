---
Task: EVAL-0038
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0037] — seed 실행(0037)은 PO 승인 대기. seed된 계정 없이는 웹 5탭 E2E가 통과 불가하므로 0037 해제까지 게이트 유지. (코드 WP 0033~0036은 완료)
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0038: Vercel ops 게이트 (웹 전용) — Preview env 등록 + 웹 E2E 실측

> 사람 게이트 task — 자율 구현 불가. 코드 WP(EVAL-0033~0037) PR 머지 후 ops 담당자가 직접 수행. spec §4·§9(manual E2E).
>
> **범위 축소 (2026-06-25)**: 원래 0038에 포함됐던 Protection Bypass 토큰 발급·RN 실기기 E2E는 EVAL-0047로 분리. 웹 dogfood는 공개 Preview를 전제하므로 Vercel Authentication(Deployment Protection) 상시 ON은 불가 — 보호·bypass는 RN 실기기 테스트 시점에만 한시 켠다(EVAL-0047). 웹 경로(same-origin)는 bypass 불필요.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) OPS
- Parent Work Package: `feat/dev-login-mode` (OPS)

## Goal

Vercel 대시보드 Preview env scope에 3개 변수가 등록된다. Production scope에는 `DEV_LOGIN_ENABLED`가 없음을 확인한다. Supabase seed를 실행해 `member-active`·`balance` 계정이 생성된다. 웹 Preview에서 로고 5탭 → 계정 Sheet → `/home` 이동이 성공한다.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §4·§7·§9·D7
- `apps/web/.env.example` — 등록할 변수 목록(EVAL-0035 산출물)

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

**Production env 확인**:

- Vercel 대시보드 Production scope에서 `DEV_LOGIN_ENABLED` 미존재 확인.

**Supabase seed 실행** (EVAL-0037 선행):

- `node apps/web/scripts/dev-seed-accounts.mjs` — linked 공유 프로젝트에 1회 실행.
- append-only ledger라 비가역 — 실행 전 금액·UUID 재확인.

**수동 E2E (웹)**:

1. Preview URL → 로그인 화면 → 로고 5탭 → Sheet 열림 → "멤버·진행중" 탭 → `/home` 이동 확인.

## Non-goals

- 코드 구현 — EVAL-0033~0037.
- CI 자동 seed — 후속.
- Production env에 dev-login 변수 등록 — 금지.
- Vercel Authentication(Deployment Protection) ON/OFF 조작 — EVAL-0047(RN 실기기 시점에만 한시 수행).
- Protection Bypass 토큰 발급 — EVAL-0047.
- RN dev client 실기기 E2E — EVAL-0047.

## Acceptance Criteria

| 기준                                  | 검증 방법                                 |
| ------------------------------------- | ----------------------------------------- |
| Preview env 3개 변수 등록             | Vercel 대시보드 직접 확인                 |
| Production env DEV_LOGIN_ENABLED 없음 | Vercel 대시보드 Production scope 확인     |
| seed 실행 완료                        | 스크립트 출력 확인(skip 포함 멱등 리포트) |
| 웹 E2E: 5탭 → 로그인 성공             | 수동 실측 1회                             |

## Verification Commands

```bash
# 모두 수동 — CLI 없음
# 1. Vercel 대시보드 Preview env 확인
# 2. node apps/web/scripts/dev-seed-accounts.mjs
# 3. 웹 Preview 수동 E2E
```

## Expected Output Summary

Vercel env 등록 완료 확인 메모(3개 변수 scope), Production 미등록 확인, seed 스크립트 실행 결과 요약, 웹 E2E 성공 확인 내역을 한국어로 요약한다. RN 실기기 단계는 EVAL-0047에서 별도 수행함을 명시.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- Preview env 3개 등록 확인 + Production 미등록 확인 + seed 실행 완료 + 웹 E2E 1회 성공.
