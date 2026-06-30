---
Task: EVAL-0062
Track: port
Kind: migration
Status: done
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0062: action-videos에 video/quicktime(.mov) 추가 — migration + validators + storage

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0062` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

RN `expo-image-picker` 카메라가 iOS에서 `.mov`(`video/quicktime`)를 생성하므로, `action-videos` 버킷·영상 인증 RPC·domain validators·storage 헬퍼 네 곳을 함께 확장한다. migration `0059_action_videos_allow_mov.sql`이 (a) 버킷 `allowed_mime_types`에 `video/quicktime` 추가, (b) 영상 인증 RPC `update_action_log_video_path` 파일명 정규식을 `(mp4|webm|mov)`로 갱신한다. domain `ALLOWED_VIDEO_MIME`·storage 헬퍼(`ALLOWED_EXT`·`MIME_TO_EXT`·`EXT_TO_MIME`·`VIDEO_PATH_RE`)도 동기화하고, 기존 테스트를 quicktime 수용 방향으로 flip한다.

**spec-required 경로 주의:** `supabase/migrations/**`·`packages/domain/src/validators/**` 변경은 가드레일상 ADR-lite가 권장된다. plan이 `pnpm new adr action-videos-allow-mov`를 권고했으나 ADR 작성 자체는 사람 게이트 — 이 AT는 코드·migration만 담당한다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 3을 따른다.

## Source Files to Inspect

- `packages/domain/src/validators/action-log.ts` — `ALLOWED_VIDEO_MIME` 상수(:10)
- `packages/domain/src/validators/action-log.spec.ts` — quicktime 거부 테스트(flip 대상)
- `apps/web/src/lib/storage/action-videos.ts` — `ALLOWED_EXT`·`MIME_TO_EXT`·`EXT_TO_MIME`·`VIDEO_PATH_RE`
- `supabase/migrations/0058_device_push_tokens.sql` — 마지막 migration 번호 확인(0059가 다음)
- `supabase/migrations/0054_action_videos.sql` — update_action_log_video_path RPC 원본(정규식 교차 영향 확인)

## Target Files

- `packages/domain/src/validators/action-log.ts` — `ALLOWED_VIDEO_MIME`에 `"video/quicktime"` 추가
- `packages/domain/src/validators/action-log.spec.ts` — quicktime 테스트 flip
- `apps/web/src/lib/storage/action-videos.ts` — `ALLOWED_EXT`·`MIME_TO_EXT`·`EXT_TO_MIME`·`VIDEO_PATH_RE` 3종 추가
- 신규: supabase/migrations/0059_action_videos_allow_mov.sql (버킷 MIME + RPC 정규식)

## Requirements

- `ALLOWED_VIDEO_MIME = ["video/mp4","video/webm","video/quicktime"]` (domain SoT).
- storage `ALLOWED_EXT = ["mp4","webm","mov"]`. `MIME_TO_EXT`·`EXT_TO_MIME` 양방향 매핑 완전.
- `VIDEO_PATH_RE`: `(mp4|webm|mov)` 정규식. `looksLikeVideoPath("u1/c1/x.mov")` true.
- migration A: `update storage.buckets set allowed_mime_types = array['video/mp4','video/webm','video/quicktime']`.
- migration B: `create or replace function update_action_log_video_path` — 정규식만 `(mp4|webm|mov)` 갱신, 나머지 RPC 본문 보존. `SECURITY DEFINER set search_path = public` 유지.
- 기존 action-log domain 테스트 비파괴(quicktime 수용 flip만).

## Non-goals

- `submit_penalty_proof` RPC 수정(확장자 검사 없음 — plan §6 참조)
- RN 영상 촬영 UI — Phase F
- 영상 클라이언트 압축 — 후속

## Acceptance Criteria

| 기준                                     | 검증 방법                                          |
| ---------------------------------------- | -------------------------------------------------- |
| quicktime 수용 테스트 PASS(flip)         | `pnpm --filter @withkey/domain test -- action-log` |
| storage mov 경로 3종 PASS                | `pnpm --filter web test -- action-videos`          |
| web typecheck(MIME_TO_EXT Record 완전성) | `pnpm --filter web exec tsc --noEmit`              |
| migration 파일 존재 + 번호 0059          | 파일 경로 확인                                     |
| harness 추적성                           | `pnpm harness:check`                               |

## Verification Commands

```bash
pnpm --filter @withkey/domain test -- action-log
pnpm --filter web test -- action-videos
pnpm --filter web exec tsc --noEmit
pnpm harness:check
pnpm validate:docs
```

> migration DB 적용 검증(로컬): `pnpm supabase db reset` 후 `select allowed_mime_types from storage.buckets where id='action-videos'` + `.mov` 경로로 `update_action_log_video_path` 호출 성공. CI/머지 전 수동 1회.

## Expected Output Summary

migration `0059_action_videos_allow_mov.sql` 신규, domain `ALLOWED_VIDEO_MIME` + storage 헬퍼 4곳 갱신, quicktime 테스트 flip. domain/web 테스트 PASS, typecheck PASS를 한국어로 요약한다. ADR 작성 여부는 사람 결정으로 남긴다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? 없음.
2. Did this task introduce a new naming convention? 없음.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? `pnpm supabase db reset` 수동 검증 추가(CI 외).
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- domain test(quicktime flip) + web test(mov 3종) + typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.
