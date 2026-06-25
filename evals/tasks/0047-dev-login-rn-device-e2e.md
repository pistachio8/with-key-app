---
Task: EVAL-0047
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0038] — 웹 ops(env 등록·seed 실행·웹 E2E)가 먼저 완료돼야 RN 경로가 유효. iOS dev client 빌드 세팅(Expo Go 불가·Personal Team associatedDomains 제거·Xcode/devicectl 설치 경로) 준비도 선행.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0047: RN 실기기 dev-login E2E — Protection Bypass + 실기기 세션 교환 검증

> 사람 게이트 task — 자율 구현 불가. EVAL-0038(웹 ops) 완료 후 RN 실기기 세션이 갖춰진 시점에 수행. spec §4·D9.
>
> **이 task가 분리된 이유 (2026-06-25)**: 웹 dogfood는 공개 Preview를 전제하므로 Vercel Authentication(Deployment Protection)을 상시 ON하면 Vercel 계정 없는 외부 dogfooder가 전면 차단된다. 보호·Protection Bypass는 **RN 실기기 바이패스를 테스트하는 그 시점에만 한시 켠다**. 웹 경로는 same-origin이라 bypass 불필요.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) OPS
- Parent Work Package: `feat/dev-login-mode` (OPS-RN)

## Goal

RN dev client 실기기에서 "fromwith" kicker long-press → 계정 Sheet → 계정 탭 → 세션 교환 → 홈 이동이 성공한다. Protection Bypass 토큰이 `EXPO_PUBLIC_VERCEL_BYPASS`로 RN dev 빌드에 주입되고, RN이 Vercel Authentication 벽을 통과해 Preview 엔드포인트에 도달한다. 테스트 완료 후 Vercel Authentication을 원복(dogfood 공개 Preview로 복귀)한다.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §4·§5.4·D9
- `apps/mobile/app.config.ts` — `EXPO_PUBLIC_DEV_LOGIN_URL`·`EXPO_PUBLIC_VERCEL_BYPASS` 참조처
- `CLAUDE.md`(memory) — iOS 실기기 dev build 세팅(Expo Go 불가·Personal Team·Xcode Run/devicectl 우회)

## Target Files

- `apps/mobile/app.config.ts` — `EXPO_PUBLIC_VERCEL_BYPASS` 주입 확인 (이미 있으면 값만 채움)
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` — RN E2E 완료 메모(선택)

## Requirements

**Vercel Authentication 한시 ON** (이 task 수행 중에만):

- Vercel Project Settings → Deployment Protection → Vercel Authentication ON.
- 테스트 완료 후 반드시 OFF로 원복 — 공개 Preview(dogfood) 전제 복귀.

**Protection Bypass 토큰 발급**:

- Project Settings → Deployment Protection → "Protection Bypass for Automation" → Add Secret.
- 헤더/쿼리 이름: `x-vercel-protection-bypass`. 시스템 env: `VERCEL_AUTOMATION_BYPASS_SECRET`.
- 발급된 토큰 값 = `EXPO_PUBLIC_VERCEL_BYPASS`로 RN dev 빌드에 주입(dev variant 전용).

**RN dev 빌드 env 주입**:

- `EXPO_PUBLIC_DEV_LOGIN_URL`: develop 브랜치 안정 alias URL (per-deploy 해시 URL 아님).
- `EXPO_PUBLIC_VERCEL_BYPASS`: 위 토큰.

**수동 E2E (RN 실기기)**:

1. iOS dev client 실기기 → 로그인 화면 → "fromwith" kicker long-press → Sheet 열림 → 계정 탭 → 세션 교환 → 홈 이동 확인.
2. 완료 후 Vercel Authentication OFF 원복 확인.

## Non-goals

- 웹 Preview env 등록·웹 E2E — EVAL-0038(선행 완료).
- 코드 구현 — EVAL-0033~0036.
- seed 스크립트 작성 — EVAL-0037(선행 완료).
- Vercel Authentication 상시 ON — 금지(공개 Preview dogfood 전제 파괴).
- Oracle A1·몽타주 워커 등 무관 인프라.

## Acceptance Criteria

| 기준                                     | 검증 방법                                     |
| ---------------------------------------- | --------------------------------------------- |
| Protection Bypass 토큰 발급              | Vercel 대시보드 "Protection Bypass" 항목 확인 |
| `EXPO_PUBLIC_VERCEL_BYPASS` RN 빌드 주입 | app.config.ts 또는 .env.local 값 확인         |
| RN E2E: long-press → 로그인 성공         | 실기기 수동 실측 1회                          |
| Vercel Authentication 원복(OFF)          | 대시보드 확인 — dogfood 공개 Preview 복귀     |

## Verification Commands

```bash
# 모두 수동 — CLI 없음
# 1. Vercel 대시보드 Deployment Protection → Authentication ON
# 2. Protection Bypass for Automation → Add Secret → 토큰 발급
# 3. EXPO_PUBLIC_VERCEL_BYPASS 환경 주입 후 RN dev client 빌드
# 4. iOS dev client 실기기 E2E 수동 실측
# 5. Vercel Authentication OFF 원복
```

## Expected Output Summary

Protection Bypass 토큰 발급 완료, RN dev 빌드 env 주입 확인, 실기기 E2E 성공 내역, Vercel Authentication 원복 확인을 한국어로 요약한다. Vercel Authentication 상시 ON이 불가한 이유(외부 dogfooder 차단·세션 이중 로그인 부담)와 한시 운영 근거를 함께 남긴다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? No (EXPO_PUBLIC_VERCEL_BYPASS 이미 app.config.ts 설계 범위).
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- Protection Bypass 토큰 발급 + RN E2E 1회 성공 + Vercel Authentication OFF 원복 확인.
