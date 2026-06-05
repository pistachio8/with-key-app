---
Task: EVAL-0023
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0023: 온디바이스 사전검증 — 흐림·스크린샷 업로드 전 1차 거름 ("다시 찍기" 권고)

> Work Package WP3 (`feat/rn-verify-precheck`). **게이트 무관**(ES: UX 휴리스틱 — `AC-cheat-detect-3`만 G1 carve-out). WP1/WP2/WP5와 독립. 차단이 아닌 권고(빠른 응답) — 서버 판정(WP2)과 별개의 클라 1차 거름.

## Parent Links

- Parent PRD Feature: `AC-cheat-detect-3`(온디바이스 사전검증으로 흐림·스크린샷 업로드 전 1차 거름, E1) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: 별도 TS SoT 없음 — AT eval 수용기준으로 흡수(05 §2 D10). raw: [.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md](../../.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md)
- Parent Job Story: `JS-verify-4`(올리기 전에 안 될 사진은 미리 알려준다) — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP3
- Parent Work Package: `feat/rn-verify-precheck` (WP3)

## Goal

업로드 전에 명백히 안 될 사진을 즉시 걸러 헛수고를 줄인다. 이 task가 끝나면 사진 선택/촬영 직후 클라(현 PWA `fab-photo-verify-sheet`, RN 카메라 parity는 EVAL-0019 capture 경로 후속)에서 흐림·스크린샷 같은 명백 결함을 빠르게 휴리스틱 판정해, **차단이 아니라 "다시 찍기" 권고**를 노출하고 사용자가 그대로 올릴 선택지도 남긴다. 서버 판정(WP2)을 대체하지 않는 1차 거름이다.

## Source Files to Inspect

- `docs/eng-stories/2026-06-05-photo-verification.md` (WP3)
- `apps/web/src/components/app-shell/fab-photo-verify-sheet.tsx` (현 사진 업로드 UI)
- `apps/web/src/lib/storage/action-photos.ts`
- `evals/tasks/0021-verify-deterministic-signals-skeleton.md` (EVAL-0021 스크린샷 휴리스틱 재사용 — 구현 후 `apps/web/src/lib/verify/`)

## Target Files

- `apps/web/src/components/app-shell/` — 사전검증 권고 UI(업로드 전 hook)
- `apps/web/src/lib/` — 클라 사전검증 휴리스틱 `verify/`(흐림·스크린샷, EVAL-0021 모듈 재사용/공유) + 테스트

## Requirements

- 업로드 전 흐림·스크린샷 휴리스틱 1차 판정 — 빠른 응답(차단 아님).
- 결과는 **권고**("다시 찍기") + 그대로 진행 선택지. 거름이 hard block이 되지 않음(`AC-cheat-detect-3` — false-reject 비용).
- 가능하면 EVAL-0021 스크린샷/품질 휴리스틱을 클라에서 재사용(중복 로직 금지).
- 모바일 viewport에서 권고 노출·진행 흐름 동작.

## Non-goals

- 서버 status 판정 — WP2/EVAL-0022 (본 task는 클라 1차 거름, 서버 판정 대체 아님).
- phash·EXIF 신호 계산 골격 — WP2a/EVAL-0021 (본 task는 그 휴리스틱을 UX에 노출).
- RN 카메라 네이티브 capture 구현 — RN action-log MVP(EVAL-0019) 경로 후속(본 task는 현 PWA capture 기준, RN parity는 그 위에 얹음).

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

업로드 전 사전검증 hook 위치, 권고(비차단) UX, EVAL-0021 휴리스틱 재사용 지점, RN capture parity가 EVAL-0019 후속임을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — 기존 `components/app-shell/`·`lib/verify/` 재사용.
2. New naming convention? No.
3. New dependency? 클라 흐림 검출 라이브러리 도입 가능 — yes일 수 있음(registry 우선). → drift 노트.
4. Verification commands changed? No — `pnpm test -- precheck` 스코프뿐.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? 신규 의존 발생 시 yes → `evals/drift-reports/` 노트.

## Stop Condition

- 권고 노출·비차단·재사용 Acceptance Criteria green + 모바일 viewport 확인 + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 휴리스틱 / UX 권고로 split (프롬프트·컨텍스트 1회 점검 후, 05 §9.4).
