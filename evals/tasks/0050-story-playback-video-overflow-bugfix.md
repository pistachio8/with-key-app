---
Task: EVAL-0050
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0043] — 스토리 자동재생 Phase 1(recap 화면 feed_type 분기·영상 플레이어) 최초 구현. 게이트 아님(착수 가능).
Parent: docs/PRD.md
---

# EVAL-0050: 끝난 챌린지 스토리 완성 화면 영상 플레이어 overflow 레이아웃 수정

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0050` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: QA_TRIAGE.md B10 / feedback id `e6693fe2` (2026-06-25) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `fix/story-playback-video-overflow`

## Goal

끝난 챌린지 결과보기 → 스토리 자동재생 "완성" 화면("완성! N명의 7일", "4개의 3초 클립을 모았어요", "처음부터 다시 보기")에서 영상 플레이어(검정 영역)가 컨테이너 안에 contained 된다. aspect-ratio 또는 max-height 제약이 추가되어 full-bleed 세로 overflow 가 제거되고, 하단 floating action button(⚡)과 챌린지 카드가 영상 영역에 덮이지 않는다.

## Source Files to Inspect

- `apps/web/src/app/(app)/challenge/[id]/recap/_components/story-playback.tsx` — 스토리 자동재생 컴포넌트(EVAL-0043 결과물, 영상 플레이어 래퍼 포함)
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — recap 라우트 진입점·레이아웃 구조
- `apps/web/src/app/(app)/challenge/[id]/recap/_components/` — 완성 화면 관련 컴포넌트 전체

## Target Files

- `apps/web/src/app/(app)/challenge/[id]/recap/_components/story-playback.tsx` — 영상 플레이어 컨테이너에 aspect-ratio/max-height 제약 추가
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — 필요 시 레이아웃 overflow 제어 수정

## Requirements

- 완성 화면에서 영상 플레이어(검정 영역)가 컨테이너를 벗어나지 않는다(full-bleed 세로 overflow 제거).
- 영상 영역에 `aspect-ratio`(예: 9/16 세로형) 또는 `max-height` 제약을 적용해 뷰포트 경계 안에 contained 한다.
- 하단 floating action button(⚡)과 챌린지 카드가 영상 영역과 겹치지 않는다.
- 영상이 없는 챌린지(image 타입) 결과보기 화면은 변경되지 않는다.
- 영상 재생 기능 자체(재생·일시정지·완료 콜백 등)는 변경하지 않는다.

## Non-goals

- 영상 캡처·업로드 로직 변경 — EVAL-0043 범위
- 스토리 자동재생 애니메이션·전환 효과 변경
- image 타입 챌린지 recap 화면 레이아웃 변경
- 몽타주 워커(EVAL-0046) 관련 mp4 결과 화면 — 별도 fast-follow

## Acceptance Criteria

| 기준                                    | 검증 방법                                                           |
| --------------------------------------- | ------------------------------------------------------------------- |
| 영상 플레이어가 컨테이너 안에 contained | 모바일 viewport(세로) 수동 확인: 영상 영역이 FAB·하단 카드와 미겹침 |
| aspect-ratio / max-height 제약 적용     | 코드 리뷰: story-playback.tsx 영상 래퍼에 제약 클래스/스타일 존재   |
| image 타입 recap 회귀 없음              | `pnpm test -- photo-gallery` (recap 기존 테스트 green)              |
| TypeScript 컴파일 이상 없음             | `pnpm typecheck`                                                    |
| ESLint 이상 없음                        | `pnpm lint`                                                         |
| harness 추적성                          | `pnpm harness:check`                                                |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- photo-gallery
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

영상 플레이어 overflow 원인(aspect-ratio/max-height 부재), 적용한 컨테이너 제약 방식(Tailwind 클래스 또는 인라인 스타일), FAB·하단 콘텐츠 겹침 해소 확인, image 타입 recap 회귀 없음, 모바일 세로 viewport 수동 확인 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? No.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? No.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 모든 Acceptance Criteria green + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할(05 §9.4).
