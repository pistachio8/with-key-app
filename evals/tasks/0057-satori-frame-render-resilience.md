---
Task: EVAL-0057
Track: greenfield
Kind: migration
Status: todo
Parent: apps/web/src/app/api/share/recap-clip/route.ts
---

# EVAL-0057: satori 프레임 렌더 복원력·비용 절감 — per-frame 타임아웃·재시도 + 동시성 cap

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0057` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). intake run `2026-06-25T08-38-15-443-bugfix` / docs/adr/0025-recap-share-clip-render-infra.md §B(Hobby 60s 리스크 명시)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `fix/satori-frame-render-resilience`

## Goal

`/api/share/recap-clip` Route Handler 의 `renderBeatPng` 호출 경로가 한 프레임의 지연·실패로 요청 전체가 500 으로 번지는 구조를 제거한다. per-frame 타임아웃 + 1회 재시도를 추가해 부분 실패를 격리하고, `Promise.all` 무제한 동시 렌더를 동시성 cap 으로 대체해 `maxDuration=60` 예산 안에서의 satori 렌더 총 비용을 줄인다. `encode.ts`(ffmpeg 인코딩)는 건드리지 않는다. EVAL-0056 영역(인코딩 워커 이전)과 보완재이며 독립 착수 가능하다.

## Source Files to Inspect

- `apps/web/src/app/api/share/recap-clip/route.ts` — `Promise.all` 무제한 동시 렌더(L53-55), `maxDuration=60`, catch 일괄 500
- `apps/web/src/app/api/share/recap-clip/storyboard.ts` — `MAX_MONTAGE=6`, beat 구조(intro 1 + photo ≤6 + endcard 1 = 최대 8장)
- `apps/web/src/app/api/share/recap-clip/frames.tsx` — `renderIntroFrame` satori 렌더
- `apps/web/src/app/api/share/recap-clip/route.spec.ts` — 현재 테스트 커버리지 확인
- `apps/web/src/app/api/og/recap-card/templates.tsx` — `renderPhotoCard` satori 렌더(photo·endcard beat 공유)
- `docs/adr/0025-recap-share-clip-render-infra.md` — Spike §B(Hobby 60s 미측정, satori N장 렌더 리스크 명시)

## Target Files

- `apps/web/src/app/api/share/recap-clip/route.ts` — `renderBeatPng` per-frame 타임아웃·재시도 래퍼, `Promise.all` → 동시성 cap 교체
- `apps/web/src/app/api/share/recap-clip/route.spec.ts` — 타임아웃→재시도, 부분 실패 격리, 동시성 cap 테스트 케이스 추가

## Requirements

- AC-1: `renderBeatPng` → `renderBeatPngSafe` 래퍼. per-frame 타임아웃(예: 8s) + 1회 재시도. 재시도 소진 시 정적 폴백 프레임(단색 배경+그룹명) 반환 — 요청 전체 500 방지. 타임아웃 근거를 `maxDuration=60` / beat ≤8 기준으로 코드 주석 명시. 폴백 시 `console.error`(메타: challengeId·beatKind·attempt).
- AC-2: `Promise.all` → 동시성 cap(≤3). `p-limit` 또는 수동 세마포어(신규 dep 시 정당화 주석 필수). beat 순서(intro→photo×N→endcard) 보존, 렌더 호출 총 수 불변.

## Non-goals

- `encode.ts`(ffmpeg spawn·인코딩 로직) 변경 금지 — EVAL-0056 영역
- `storyboard.ts`의 `MAX_MONTAGE` 값 변경 — 렌더 수 자체 하향은 이 task 범위 밖
- Oracle A1 워커 연동 — EVAL-0056 선행 필요
- 프라이버시 경계(계좌·실명·벌금액 비렌더) 변경 금지 — 기존 유지
- 신규 npm 의존성 추가는 `p-limit` 한 건만 허용, 그 외는 금지
- `frames.tsx` · `storyboard.ts` · `encode.ts` 구조 변경 금지

## Acceptance Criteria

| 기준                                                                | 검증 방법                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 한 프레임 타임아웃 시 재시도 1회 후 폴백 프레임 반환, 요청 200 유지 | `pnpm test -- "src/app/api/share/recap-clip"` (타임아웃→재시도→폴백 mock) |
| 재시도 소진 시 폴백 프레임(단색+텍스트) 으로 mp4 정상 완료          | `pnpm test -- "src/app/api/share/recap-clip"` (모든 재시도 실패 mock)     |
| 동시성 cap ≤3: 최대 8장 렌더 시 동시 실행 수가 3 초과하지 않음      | `pnpm test -- "src/app/api/share/recap-clip"` (동시 실행 수 카운트 spy)   |
| storyboard beat 순서 보존(intro→photo→endcard)                      | `pnpm test -- "src/app/api/share/recap-clip"`                             |
| encode.ts 미변경 — 기존 encodeClip mock 테스트 green 유지           | `pnpm test -- "src/app/api/share/recap-clip"`                             |
| TypeScript 이상 없음                                                | `pnpm typecheck`                                                          |
| ESLint 이상 없음                                                    | `pnpm lint`                                                               |
| harness 추적성                                                      | `pnpm harness:check`                                                      |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- "src/app/api/share/recap-clip"
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`renderBeatPngSafe` 래퍼 구현(타임아웃 값·근거·재시도 횟수), 폴백 프레임 구현(단색 배경+그룹명), 동시성 cap 선택 방식(p-limit 또는 수동 세마포어·선택 근거), beat 순서 보존 확인, `encode.ts` 미변경 확인, 추가 테스트 케이스 목록을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? `renderBeatPngSafe` 래퍼 패턴. drift-reports 노트.
3. Did this task introduce a new dependency? `p-limit` 사용 시 yes — drift-reports 노트.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- AC-1(재시도·폴백)·AC-2(동시성 cap) 모두 테스트 green + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → AC-1·AC-2 를 별도 task 로 split-work-packages 분할(05 §9.4).
