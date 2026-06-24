---
Task: EVAL-0043
Track: greenfield
Kind: migration
Status: done
Blocked-by: [task:EVAL-0042] — RESOLVED 2026-06-24 EVAL-0042 done(`challenges.feed_type` 컬럼이 `0051_feed_type_penalty_mission.sql` 에 존재 · `challengeInputSchema.feedType` default 'image' 도출 완료). flip 승인: 사용자(orchestrate D6).
Parent: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0043: 영상 캡처·저장 + 스토리 자동재생(Phase 1) 구현

> spec §C2·C6-A·C7 및 Rollout ② 구현. `action-videos` private 버킷, `action_logs` 영상 컬럼(`media_type`·`video_path`), `video-signed-url.ts`(ADR-0024 패턴), `FeedItemView.videoSignedUrl`, 챌린지 생성 UI 피드 타입 선택, recap 화면 `feed_type` 분기(스토리 자동재생)를 포함한다.

> **후속 추적 (2026-06-24, done 이후 발견 갭 close)** — 본 task 는 영상 **인증 캡처 UI**(Phase 2·out of scope)와 피드 카드의 **영상 렌더**(`FeedItemView.videoSignedUrl` 데이터만 배선, `FeedCard` 표시 누락) 두 갭을 남긴 채 done 처리됐다. 사용자 실기 보고("동영상 챌린지 퀵버튼 촬영하기 에러" → "스토리에 클립이 안보여")로 발견. close: **PR #271** = `submit-core` `mediaType` 분기 + `video-action-form`(실시간 3초 캡처) → 영상 인증 경로 / **PR #272** = `FeedCard` `<video>` 렌더 + `challenge-feed.tsx` 전달 → 피드 표시. 마이그레이션 0(0054 자산 재사용). recap StoryPlayback 은 종료/만기 챌린지만 진입이 정상(`recap.ts` running 미진입).

## Parent Links

- Parent PRD Feature: spec §C2 · §C6-A · §C7 — [2026-06-23-feed-type-penalty-redesign-design.md](../../docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `feat/video-capture-story-playback`

## Goal

`0052` migration으로 `action-videos` 버킷·`action_logs` 영상 컬럼이 추가되고 불변 트리거가 갱신된다. `video-signed-url.ts`(ADR-0024 패턴)·`FeedItemView.videoSignedUrl`이 구현된다. 챌린지 생성 폼이 `feedType` UI를 갖고 `recap/page.tsx`가 `feed_type` 분기(영상=스토리 자동재생·이미지=기존)로 동작한다.

## Source Files to Inspect

- **화면 시안(디자인 SoT)** — `docs/mockups/2026-06-24-feed-type-penalty/action-video.html`(3초 캡처·권한 플로우) · 스토리 `docs/mockups/2026-06-24-feed-type-penalty/recap-story.html`(자동재생, state=empty 빈 클립) · 생성 폼 `docs/mockups/2026-06-24-feed-type-penalty/challenge-new.html`. 허브 ▶ 로 동작 확인 (spec §화면 시안)
- `apps/web/src/lib/db/reads/challenge-feed.ts` — `FeedItemView` 타입·`photoSignedUrl` 패턴(확장 기준)
- `apps/web/src/lib/db/reads/photo-signed-url.ts` — ADR-0024 패턴 SoT(`adminClient()` + `"use cache"` + `cacheTag` + `cacheLife`)
- `apps/web/src/lib/storage/action-photos.ts` — 기존 action-photos 버킷 패턴(action-videos 구현 기준)
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — 분기 지점
- `apps/web/src/app/(flow)/challenge/new/_actions.ts` — 생성 폼 현행 액션
- `supabase/migrations/0046_action_logs_body_immutable_client_only.sql` — 불변 트리거 현행 금지 컬럼 열거
- `packages/domain/src/validators/action-log.ts` — 영상 MIME·크기 검증 추가 대상

## Target Files

- `supabase/migrations/` — 신규 `0052_action_videos.sql`(`action-videos` 버킷·RLS·`action_logs` 영상 컬럼·`0046` 트리거 갱신)
- `apps/web/src/lib/storage/` — 신규 `action-videos.ts`(영상 업로드·삭제)
- `apps/web/src/lib/db/reads/` — 신규 `video-signed-url.ts`(ADR-0024 복제본)
- `apps/web/src/lib/db/reads/challenge-feed.ts` — `FeedItemView.videoSignedUrl` 추가 + 배선
- `apps/web/src/app/(flow)/challenge/new/_actions.ts` — `feedType` 전달 확장
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — `feed_type` 분기(이미지=기존, 영상=스토리 자동재생)
- `packages/domain/src/validators/action-log.ts` — 영상 MIME(`video/mp4`·`video/webm`)·길이·크기 검증

## Requirements

- `0052` migration: `action-videos` private 버킷. `action_logs`에 `media_type text not null default 'photo' check (media_type in ('photo','video'))`, `video_path text nullable`. 기존 행 backfill. `prevent_action_log_body_mutation` 트리거를 `create or replace`로 갱신해 `media_type` 불변 추가(`video_path` 제외). RLS: SELECT=그룹 멤버, write=RPC만, Public 버킷 금지.
- `video-signed-url.ts`: `photo-signed-url.ts` 패턴 복제(`"use cache"` inline + `cacheTag` + `cacheLife` + `adminClient()` + 600s). wrapper closure 금지(AGENTS.md §Cache Components).
- `FeedItemView`에 `videoSignedUrl?: string` 추가. `challenge-feed.ts` 배선(`feed_type='video'`시 호출).
- 생성 폼: `feedType` UI(기본 `image`) + `create_challenge` 액션 전달.
- `recap/page.tsx`: `feed_type='image'` → `PhotoGallery`, `feed_type='video'` → 스토리 자동재생(클라이언트 순서 재생). 이미지 회귀 테스트.
- `action-log.ts` validator: 영상 MIME·길이 ≤3.5s·크기 상한. `auto_verify_status='passed'` 기본값("캡처 수용" 코멘트 필수).

## Non-goals

- `penalty_proofs`·redemption·몽타주 — EVAL-0044/0045/0046
- analytics·RN vision-camera·Phase 2 — 후속·out of scope

## Acceptance Criteria

| 기준                                    | 검증 방법                    |
| --------------------------------------- | ---------------------------- |
| 버킷 private + RLS(write=RPC만)         | CI Integration RLS 실측      |
| `video-signed-url.ts` ADR-0024 패턴     | `pnpm build`(빌드 오류 없음) |
| 이미지 recap 회귀 없음                  | `pnpm test -- recap`         |
| `FeedItemView.videoSignedUrl` 타입 통과 | `pnpm typecheck`             |
| harness 추적성                          | `pnpm harness:check`         |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- recap
pnpm test -- action-log
pnpm harness:check
pnpm build
pnpm test:integration -- action-videos-rls
```

## Expected Output Summary

migration 0052 범위(버킷·컬럼·트리거 갱신), `video-signed-url.ts` ADR-0024 복제 근거, `FeedItemView` 배선 방식, 이미지 recap 회귀 테스트 결과, `auto_verify_status='passed'` 기본값 채택 이유(캡처 수용 코멘트)를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부를 확인하고 yes 항목은 `evals/drift-reports/`에 노트.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).
