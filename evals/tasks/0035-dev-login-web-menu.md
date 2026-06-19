---
Task: EVAL-0035
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0034] — 라우트 확장(email 분기) 완성 선행 — 메뉴가 호출할 email 경로가 동작해야 함.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0035: web dev 로그인 메뉴 — 5탭 제스처 + Sheet + .env.example

> WP3 (`feat/dev-login-mode`). web 숨긴 메뉴 컴포넌트 신규 + login-screen 로고 탭 연결 + env 주석. spec §5.3.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) WP3
- Parent Work Package: `feat/dev-login-mode` (WP3)

## Goal

`dev-login-menu.tsx` 가 `NEXT_PUBLIC_DEV_LOGIN === '1'` 일 때만 렌더되는 숨긴 메뉴를 제공한다. `login-screen.tsx` 의 로고 `<Image>`(h1 내)에 5회 탭 카운터를 달아 계정 목록 `Sheet` 를 연다. 계정 항목 탭 시 `window.location.href = /auth/dev-login?email=<picked>&next=/home` 으로 이동(브라우저 navigation이므로 Server Action 금지 가드레일 적용 안 됨). `.env.example` 에 3개 env 주석이 추가된다. 빌드가 PASS 된다.

## Source Files to Inspect

- `apps/web/src/app/(auth)/login/_components/login-screen.tsx` — 로고 Image 위치(line ~134), "use client" 여부
- `apps/web/src/components/ui/dialog.tsx` — 모달/Sheet 대체 컴포넌트(sheet.tsx 미존재 — dialog 또는 직접 absolute 구현)
- `apps/web/.env.example` — 기존 DEV_LOGIN_EMAIL(단수) 주석 위치
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §5.3·§5.5·§4(게이팅 모델)

## Target Files

- `apps/web/src/app/(auth)/login/_components/login-screen.tsx` — 5탭 카운터 + DevLoginMenu 조건 렌더 (외과적 추가)
- `apps/web/.env.example` — 3개 env 주석 추가
- `apps/web/src/app/(auth)/login/_components/` — 신규 dev-login-menu.tsx (NEXT_PUBLIC_DEV_LOGIN 조건 메뉴)

## Requirements

- `dev-login-menu.tsx`: `'use client'` + `NEXT_PUBLIC_DEV_LOGIN === '1'` 조건 미충족 시 `null` 반환.
- `DEV_ACCOUNTS` 상수 (파일 내 또는 별도 constants):
  ```ts
  const DEV_ACCOUNTS = [
    { label: "멤버·진행중", email: "member-active@fromwith.test" },
    { label: "잔액 있음", email: "balance@fromwith.test" },
  ];
  ```
- 5탭 카운터: `login-screen.tsx` 로고 Image 래퍼에 `onClick` + 로컬 state. 5회 누르면 `dev-login-menu.tsx` 내 Sheet `open=true`.
- 항목 탭: `window.location.href = \`/auth/dev-login?email=${encodeURIComponent(email)}&next=/home\``.
- Sheet 닫기: 항목 탭 또는 Sheet 외부 클릭 시 카운터 리셋.
- `.env.example` 추가 주석 (기존 `DEV_LOGIN_EMAIL` 단수와 구분):
  ```
  # DEV_LOGIN_ENABLED=true           # Preview env scope only — 서버 토큰 엔드포인트 활성화
  # NEXT_PUBLIC_DEV_LOGIN=1          # Preview env scope only — web 숨긴 메뉴 표시
  # DEV_LOGIN_EMAILS=member-active@fromwith.test,balance@fromwith.test  # Preview env scope only
  ```
- `pnpm build` PASS (NEXT_PUBLIC_DEV_LOGIN 미설정 시 메뉴가 null 반환 → tree-shake).

## Non-goals

- 애니메이션·스타일 커스터마이징 — 기본 Sheet UI로 충분.
- E2E 자동 테스트 — manual(§9 spec).
- RN 메뉴 — EVAL-0036.
- 서버 코어·라우트 — EVAL-0033·EVAL-0034.

## Acceptance Criteria

| 기준                                | 검증 방법                                    |
| ----------------------------------- | -------------------------------------------- |
| NEXT_PUBLIC_DEV_LOGIN 미설정 → null | 컴포넌트 렌더 조건 코드 리뷰                 |
| 5탭 → Sheet 열림                    | 코드 구조 확인 (카운터 state + open trigger) |
| 항목 탭 → window.location           | href 할당 코드 확인                          |
| .env.example 3개 주석 추가          | grep DEV_LOGIN_ENABLED .env.example          |
| typecheck·lint                      | `pnpm typecheck && pnpm lint` PASS           |
| build PASS                          | `pnpm build` PASS                            |
| harness traceability                | `pnpm harness:check` PASS                    |

## Verification Commands

```bash
pnpm harness:context EVAL-0035
pnpm typecheck && pnpm lint
pnpm build
pnpm harness:check
```

## Expected Output Summary

`dev-login-menu.tsx` 구현 결정(Sheet 재사용·5탭 카운터 state 위치), `login-screen.tsx` 외과적 변경 내역(로고 래퍼 onClick 추가만), `.env.example` 3개 주석 내용, `NEXT_PUBLIC_DEV_LOGIN` 조건 분기가 tree-shake를 어떻게 보장하는지를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No (`_components/` 기존).
2. New naming convention? No.
3. New dependency? No (Sheet 기존 UI primitive).
4. Verification commands changed? No (build 추가지만 spec §9 명시).
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- typecheck·lint PASS + `pnpm build` PASS + `.env.example` grep 확인 + `pnpm harness:check` PASS.
- pass@3 미달 → Sheet 로직·env 추가 분리.
