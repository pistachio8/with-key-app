---
Task: EVAL-0023
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0023: 온디바이스 사전검증 — 흐림·스크린샷 업로드 전 1차 거름 ("다시 찍기" 권고)

> WP3 (`feat/rn-verify-precheck`). 게이트 무관(`AC-cheat-detect-3`만 G1 carve-out). WP1/WP2/WP5와 독립. 차단 아닌 권고 — 서버 판정(WP2)과 별개의 클라 1차 거름.

## Parent Links

- Parent PRD Feature: `AC-cheat-detect-3`(온디바이스 사전검증으로 흐림·스크린샷 업로드 전 1차 거름, E1) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-4`(올리기 전에 안 될 사진은 미리 알려준다) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP3
- Parent Work Package: `feat/rn-verify-precheck` (WP3)

## Goal

업로드 전 명백히 안 될 사진을 즉시 걸러 헛수고를 줄인다. 사진 선택/촬영 직후 클라(현 PWA `fab-photo-verify-sheet`, RN parity는 EVAL-0019 후속)에서 흐림·스크린샷을 휴리스틱 판정해 **"다시 찍기" 권고**(비차단)를 노출한다. 그대로 올릴 선택지도 유지. 서버 판정(WP2) 대체 아닌 1차 거름.

## Source Files to Inspect

- `docs/eng-stories/2026-06-05-photo-verification.md` (WP3)
- `apps/web/src/components/app-shell/fab-photo-verify-sheet.tsx` (현 사진 업로드 UI)
- `apps/web/src/lib/storage/action-photos.ts`
- `evals/tasks/0021-verify-deterministic-signals-skeleton.md` (EVAL-0021 스크린샷 휴리스틱 재사용 — 구현 후 `apps/web/src/lib/verify/`)

## Target Files

- `apps/web/src/components/app-shell/` — 사전검증 권고 UI(업로드 전 hook)
- `apps/web/src/lib/` — 클라 사전검증 휴리스틱 `verify/`(흐림·스크린샷, EVAL-0021 모듈 재사용/공유) + 테스트

## Requirements

- 업로드 전 흐림·스크린샷 휴리스틱 판정 — 빠른 응답, hard block 금지(`AC-cheat-detect-3`).
- 결과는 권고("다시 찍기") + 그대로 진행 선택지.
- EVAL-0021 휴리스틱 클라 재사용(중복 로직 금지).
- 모바일 viewport 동작.

## Non-goals

- 서버 status 판정 — WP2/EVAL-0022.
- phash·EXIF 신호 골격 — WP2a/EVAL-0021(본 task는 그 휴리스틱을 UX에 노출).
- RN 카메라 네이티브 capture — EVAL-0019 후속(본 task는 현 PWA 기준, RN parity는 그 위).

## Acceptance Criteria

| 기준                                     | 검증 방법                                                         |
| ---------------------------------------- | ----------------------------------------------------------------- |
| 흐림·스크린샷 권고 (`AC-cheat-detect-3`) | 흐린/스크린샷 입력 → "다시 찍기" 권고 노출 (단위/컴포넌트 테스트) |
| 비차단                                   | 권고 후에도 그대로 진행 가능 — hard block 부재 확인               |
| 빠른 응답                                | 업로드 전 동기 휴리스틱(네트워크 왕복 없음)                       |
| 휴리스틱 재사용                          | EVAL-0021 모듈 공유(중복 구현 부재) 코드 대조                     |
| harness traceability                     | `pnpm harness:check` 통과                                         |

## Verification Commands

```bash
pnpm harness:context EVAL-0023
pnpm typecheck && pnpm lint
pnpm test -- precheck
pnpm harness:check
# 모바일 viewport 수동 확인 (업로드 전 권고 흐름)
```

## Expected Output Summary

사전검증 hook 위치, 권고(비차단) UX, EVAL-0021 재사용 지점, RN parity가 EVAL-0019 후속임을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — 기존 `components/app-shell/`·`lib/verify/` 재사용.
2. New naming convention? No.
3. New dependency? 흐림 검출 라이브러리 도입 가능(yes 가능, registry 우선) → drift 노트.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 갱신? 신규 의존 발생 시 yes → `evals/drift-reports/` 노트.

## Stop Condition

- 권고·비차단·재사용 AC green + 모바일 viewport 확인 + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 휴리스틱 / UX 권고로 split(05 §9.4).
