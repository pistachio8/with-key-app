---
Task: EVAL-0028
Track: greenfield
Kind: migration
Status: todo
Parent: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md, docs/superpowers/plans/2026-06-10-feedback-suggestion.md
---

# EVAL-0028: 건의 서버 파이프라인 — feedback-photos 헬퍼 + Slack notify + submitFeedback Server Action

> WP-feedback (`feat/feedback-submit`). 외부 게이트 없음 → `todo`. **Depends-on: EVAL-0027**(feedbackSchema·migration 0047 — 같은 WP 내 순서 의존, blocked 아님). plan Task 4·5·6 묶음(서버 레이어).

## Parent Links

- Parent PRD Feature: PRD AC 없음 — dogfood 운영 기능, spec이 AC SoT — [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md) §Verification
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: JS 인스턴스 없음(스코프 밖) — 의도는 spec §Why 참조: [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md)
- Parent Engineering Story: ES 인스턴스 없음(스코프 밖) — 구현 계획이 대행: [2026-06-10-feedback-suggestion.md](../../docs/superpowers/plans/2026-06-10-feedback-suggestion.md) Task 4·5·6
- Parent Work Package: `feat/feedback-submit` (WP-feedback)

## Goal

건의 제출의 서버 경로가 닫힌다. 세 하위 목표로 구성된다(plan Task 4·5·6 대응):

**G1 — storage 헬퍼 (plan Task 4)**
`feedback-photos` 업로드·signed URL(TTL 72h)·삭제 헬퍼(2-segment path, traversal 거부)가 단위 테스트와 함께 존재한다.

- done 기준: `cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts` 6개 green + path 정규식·traversal throw·TTL 72h 커버.

**G2 — Slack notify (plan Task 5)**
Slack #qa webhook 알림(`AbortController` 2.5s 타임아웃, env 미설정 시 silent skip, **never-throw**)이 단위 테스트와 함께 존재한다.

- done 기준: `cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts` 5개 green + `SLACK_FEEDBACK_WEBHOOK_URL`에 `NEXT_PUBLIC_` 접두 없음 grep 확인.

**G3 — submitFeedback Server Action (plan Task 6)**
`submitFeedback` Server Action(`withUser` + `ActionResult` 계약: zod 검증 → id 선생성 → 사진 업로드 선행(실패 시 비파괴 폴백) → insert(실패 시 orphan object best-effort remove) → `after()` Slack)이 단위 테스트와 함께 존재한다.

- done 기준: `cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"` 6개 green + `submitFeedback`이 `withUser` 경유 확인.

UI는 없다(EVAL-0029). EVAL-0027 산출물(`feedbackSchema`·migration 0047)이 develop에 머지돼 있어야 착수 가능.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md`
- `docs/superpowers/plans/2026-06-10-feedback-suggestion.md`
- `apps/web/src/lib/storage/action-photos.ts`
- `apps/web/src/app/(app)/me/_actions.spec.ts`
- `apps/web/src/lib/auth/with-user.ts`
- `apps/web/src/lib/actions/response.ts`
- `apps/web/src/lib/supabase/admin.ts`
- `evals/tasks/0027-feedback-domain-and-db.md`

## Target Files

- `apps/web/src/lib/storage/` — 신규 `feedback-photos.ts` + `feedback-photos.spec.ts` (2-segment path 빌더·업로드·signed URL·삭제)
- `apps/web/src/lib/` — 신규 `slack/` 폴더: `notify.ts` + `notify.spec.ts`
- `apps/web/src/app/(app)/me/` — 신규 `feedback/_actions.ts` + `feedback/_actions.spec.ts` (`submitFeedback`)

## Requirements

구현 상세는 plan Task 4·5·6(SoT)을 따른다. 핵심 결정만 기록:

- G1: `buildFeedbackPhotoPath`(2-segment, traversal throw, heic 거부), TTL 72h, `extFromFile` 재사용. 테스트 6개.
- G2: `SLACK_FEEDBACK_WEBHOOK_URL` server-only, 미설정 silent skip, 2.5s timeout, never-throw. 테스트 5개.
- G3: `submitFeedback` — id 선생성(INSERT-only RLS라 `.select()` 불가) → 업로드 선행(실패 시 폴백) → insert(실패 시 orphan remove) → `after()` Slack. 테스트 6개.
- 로그는 메타(feedbackId·reason)만.

## Non-goals

- migration·validator·문서 — EVAL-0027 산출물 소비만.
- UI·진입점·모바일 수동·RLS 실측 — EVAL-0029.
- 서버 rate limit — EVAL-0029 폼 책임.
- `AnalyticsEvent` 추가 없음. Vercel env 설정 — 운영 후속.

## Acceptance Criteria

| 기준                                   | 검증                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| storage 헬퍼 테스트 6개 green          | `cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts`      |
| Slack notify 테스트 5개 green          | `cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts`                 |
| submitFeedback 테스트 6개 green        | `cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"` |
| Server Action + `withUser` 경유        | 코드 대조                                                                                    |
| `SLACK_FEEDBACK_WEBHOOK_URL` 서버 전용 | `NEXT_PUBLIC_` 접두 없음 grep                                                                |
| harness traceability                   | `pnpm harness:check`                                                                         |

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

1. New folder structure? (`apps/web/src/lib/slack/` 신규라 yes 예상 → drift 노트)
2. New naming convention?
3. New dependency?
4. Verification commands changed?
5. Harness instructions outdated?
6. `.agents/` update needed?
   → yes 있으면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition

**정상 종료(done)**: G1·G2·G3 done 기준 충족 + Verification Commands green + Harness Impact 답변 완료.

**중단·에스컬레이션**:

- EVAL-0027(`feedbackSchema`·migration 0047)이 develop에 없으면 → 착수 불가, 중단·보고.
- spec §C4 Action 순서와 `withUser`/`ActionResult` 계약 충돌 시 → 강행 금지, 중단·보고.
- `extFromFile` 시그니처 불일치 시 → 재검토 후 중단·보고(복제 금지).
- `SLACK_FEEDBACK_WEBHOOK_URL`에 `NEXT_PUBLIC_` 붙는 경우 → 즉시 중단, 보안 위반 보고.

**split 기준**: pass@3 미달 시 G1/G2/G3 단위 분할.
