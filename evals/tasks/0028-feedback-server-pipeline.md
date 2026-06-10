---
Task: EVAL-0028
Track: greenfield
Kind: migration
Status: todo
Parent: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md, docs/superpowers/plans/2026-06-10-feedback-suggestion.md
---

# EVAL-0028: 건의 서버 파이프라인 — feedback-photos 헬퍼 + Slack notify + submitFeedback Server Action

> WP-feedback (`feat/feedback-suggestion`). 외부 게이트 없음 → `todo`. **Depends-on: EVAL-0027**(feedbackSchema·migration 0047 — 같은 WP 내 순서 의존, blocked 아님). plan Task 4·5·6 묶음(서버 레이어).

## Parent Links

- Parent PRD Feature: PRD AC 없음 — dogfood 운영 기능, spec이 AC SoT — [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md) §Verification
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: JS 인스턴스 없음(스코프 밖) — 의도는 spec §Why 참조: [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md)
- Parent Engineering Story: ES 인스턴스 없음(스코프 밖) — 구현 계획이 대행: [2026-06-10-feedback-suggestion.md](../../docs/superpowers/plans/2026-06-10-feedback-suggestion.md) Task 4·5·6
- Parent Work Package: `feat/feedback-suggestion` (WP-feedback)

## Goal

건의 제출의 서버 경로가 닫힌다. 완료 시 ① `feedback-photos` 업로드·signed URL(TTL 72h)·삭제 헬퍼(2-segment path, traversal 거부) ② Slack #qa webhook 알림(`AbortController` 2.5s 타임아웃, env 미설정 시 silent skip, **never-throw**) ③ `submitFeedback` Server Action(`withUser` + `ActionResult` 계약: zod 검증 → id 선생성 → 사진 업로드 선행(실패 시 비파괴 폴백) → insert(실패 시 orphan object best-effort remove) → `after()` Slack)이 단위 테스트와 함께 존재한다. UI는 없다(EVAL-0029).

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md` (§C2 경로 규격·§C4 Action 순서·§C5 never-throw)
- `docs/superpowers/plans/2026-06-10-feedback-suggestion.md` (Task 4·5·6 — 테스트·구현 본문)
- `apps/web/src/lib/storage/action-photos.ts` (`extFromFile` 재사용, 3-segment `PHOTO_PATH_RE` 와 규격 차이 확인)
- `apps/web/src/app/(app)/me/_actions.spec.ts` (Server Action 모킹 스타일 — 모듈 mock + 테이블 분기)
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` (`after()` push 패턴 — Slack 동형)
- `apps/web/src/lib/auth/with-user.ts` (Server Action 인증 래퍼)
- `apps/web/src/lib/actions/response.ts` (`success`/`failure`/`validationFailure` 계약)
- `apps/web/src/lib/actions/supabase-error.ts` (insert 에러 매핑)
- `apps/web/src/lib/supabase/admin.ts` (`adminClient` — signed URL 1회성 생성, ADR-0024 비위반 근거는 spec §C5)
- `evals/tasks/0027-feedback-domain-and-db.md` (의존 — 구현 후 `feedbackSchema`·migration 0047)

## Target Files

- `apps/web/src/lib/storage/` — 신규 `feedback-photos.ts` + `feedback-photos.spec.ts` (2-segment path 빌더·업로드·signed URL·삭제)
- `apps/web/src/lib/` — 신규 `slack/` 폴더: `notify.ts` + `notify.spec.ts`
- `apps/web/src/app/(app)/me/` — 신규 `feedback/_actions.ts` + `feedback/_actions.spec.ts` (`submitFeedback`)

## Requirements

- storage 헬퍼 = plan Task 4 그대로: `buildFeedbackPhotoPath`(`{userId}/{feedbackId}-{nonce}.{ext}`, segment 정규식·traversal throw·heic 거부), `looksLikeFeedbackPhotoPath`, `FEEDBACK_SIGNED_URL_TTL_SECONDS = 72h`, `uploadFeedbackPhoto`(size/mime → `{ ok:false, reason }`), `extFromFile`은 `action-photos.ts`에서 재사용. 테스트 6개.
- Slack notify = plan Task 5 그대로: `SLACK_FEEDBACK_WEBHOOK_URL` server-only(`NEXT_PUBLIC_` 금지), 미설정 silent skip, 2.5s `AbortController`, fetch 실패·non-2xx에도 never-throw(에러 로그만), payload에 카테고리 라벨·본문·제출자·photoUrl(있을 때만). 테스트 5개.
- `submitFeedback` = plan Task 6 그대로: FormData 파싱 → `feedbackSchema.safeParse`(실패 시 `validationFailure`, DB 미접근) → `randomUUID()` id 선생성(INSERT-only RLS라 `.select()` 불가) → 사진 업로드 선행, 실패 시 `photo_path=null` 폴백(제출은 성공) → insert 실패 시 업로드 객체 best-effort remove + Slack 미발송 → 성공 시 `after()`에서 admin signed URL + notify. 테스트 6개.
- 프롬프트/본문 로깅 금지 — 로그는 메타(feedbackId·reason)만.

## Non-goals

- migration·validator·문서 — EVAL-0027(본 task는 소비만).
- `/me/feedback` 폼·페이지·진입점·모바일 수동·RLS 실측 — EVAL-0029.
- 서버 rate limit(더블 제출 방지는 클라이언트 버튼 비활성 — EVAL-0029 폼 책임).
- 분석 이벤트 추가 없음 — `AnalyticsEvent` union 불변.
- Vercel env 실값 설정(운영 후속 — 코드 차단 없음).

## Acceptance Criteria

| 기준                                                                  | 검증 방법                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| storage 헬퍼 테스트 6개 green (2-segment path·traversal 거부·TTL 72h) | `cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts` |
| Slack notify 테스트 5개 green (env skip·POST·never-throw)             | `cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts`            |
| submitFeedback 테스트 6개 green (성공·invalid_input·폴백·orphan 정리·Slack 실패 무영향) | `cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"` |
| 쓰기 경로 Server Action 일원화                                        | `submitFeedback`이 `_actions.ts` + `withUser` 경유 코드 대조                            |
| 서버 전용 env — 클라이언트 번들 미포함                                | `SLACK_FEEDBACK_WEBHOOK_URL`에 `NEXT_PUBLIC_` 접두 없음 grep 확인                       |
| harness traceability                                                  | `pnpm harness:check` 통과                                                                |

## Verification Commands

```bash
pnpm harness:context EVAL-0028
cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts
cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts
cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"
pnpm typecheck && pnpm lint
pnpm harness:check
```

## Expected Output Summary

세 모듈(storage 헬퍼·slack notify·Server Action) 위치, 업로드 선행 ↔ orphan object 트레이드오프 처리 지점, never-throw 보장 방식, EVAL-0027 산출물 소비 지점, EVAL-0029가 호출할 `submitFeedback` 계약을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답 — drift 루프 입력)

1. Did this task introduce a new folder structure? (답은 구현 시 작성 — 단 `apps/web/src/lib/slack/` 신규 폴더라 **yes 예상** → drift 노트)
2. Did this task introduce a new naming convention? (답은 구현 시 작성)
3. Did this task introduce a new dependency? (답은 구현 시 작성)
4. Did this task change verification commands? (답은 구현 시 작성)
5. Did this task reveal that the current harness instructions are outdated? (답은 구현 시 작성)
6. Should any `.agents/` document be updated? (답은 구현 시 작성)
   → 하나라도 yes면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition

- 모든 Acceptance Criteria green + Verification 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → storage 헬퍼 / Slack notify / Server Action으로 split(05 §9.4).
