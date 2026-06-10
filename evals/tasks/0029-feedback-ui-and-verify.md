---
Task: EVAL-0029
Track: greenfield
Kind: migration
Status: todo
Parent: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md, docs/superpowers/plans/2026-06-10-feedback-suggestion.md
---

# EVAL-0029: 건의 UI + 전체 검증 — /me/feedback 폼·진입점 + 빌드·모바일 수동·RLS 실측

> WP-feedback (`feat/feedback-suggestion`). 외부 게이트 없음 → `todo`. **Depends-on: EVAL-0028**(`submitFeedback` 계약 — 같은 WP 내 순서 의존, blocked 아님). plan Task 7·8·9 묶음(UI 레이어 + WP 종결 검증).

## Parent Links

- Parent PRD Feature: PRD AC 없음 — dogfood 운영 기능, spec이 AC SoT — [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md) §Verification
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: JS 인스턴스 없음(스코프 밖) — 의도는 spec §Why 참조: [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md)
- Parent Engineering Story: ES 인스턴스 없음(스코프 밖) — 구현 계획이 대행: [2026-06-10-feedback-suggestion.md](../../docs/superpowers/plans/2026-06-10-feedback-suggestion.md) Task 7·8·9
- Parent Work Package: `feat/feedback-suggestion` (WP-feedback)

## Goal

사용자가 실제로 건의를 보낼 수 있게 되고 WP가 닫힌다. 완료 시 ① `/me/feedback` 페이지(RSC `requireUser` 게이트)와 클라이언트 폼(카테고리 Select·본문 Textarea 글자 카운터·사진 첨부 `prepareForUpload` 전처리/미리보기/제거·제출 중 비활성·인라인 성공 상태)이 EVAL-0028의 `submitFeedback`을 호출하고 ② `/me`에 진입 행이 추가되며 ③ 전체 게이트(typecheck·lint·test·validate:docs·build) + 모바일 viewport 수동 시나리오 + RLS 실측(anon/타인 INSERT 거부·authenticated SELECT 0 rows)이 spec §Verification 대로 통과한다.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md` (§C6 UI·§Verification 시나리오)
- `docs/superpowers/plans/2026-06-10-feedback-suggestion.md` (Task 7·8·9 — 컴포넌트 본문·검증 절차)
- `apps/web/src/app/(app)/me/page.tsx` (진입 행 배치 지점)
- `apps/web/src/app/(app)/me/_components/legal-links.tsx` (카드 행 스타일 동형)
- `apps/web/src/lib/auth/require-user.ts` (RSC 인증 게이트)
- `apps/web/src/lib/image/prepare-upload.ts` (HEIC→JPEG·리사이즈 전처리)
- `apps/web/src/app/(app)/group/[id]/_components/account-input-sheet.tsx` (`Select` `items` prop 검증된 사용례)
- `apps/web/src/app/not-found.tsx` (`Link` + `buttonVariants` link-as-button 패턴 — base-ui Button은 asChild 미지원)
- `evals/tasks/0028-feedback-server-pipeline.md` (의존 — 구현 후 `submitFeedback` 계약)

## Target Files

- `apps/web/src/app/(app)/me/` — 신규 `feedback/page.tsx` + `feedback/_components/feedback-form.tsx`
- `apps/web/src/app/(app)/me/_components/` — 신규 `feedback-link.tsx` (legal-links 동형 카드 행)
- `apps/web/src/app/(app)/me/page.tsx` — `<FeedbackLink />` 를 `<LegalLinks />` 바로 위에 배치 (수정)

## Requirements

- `page.tsx`·`feedback-form.tsx`·`feedback-link.tsx` = plan Task 7·8 코드 그대로: 카테고리 기본 `bug`, 본문 1000자 `maxLength` + 잔여 카운터, 사진 1장(5MB/형식 클라 검증 → `prepareForUpload` → `URL.createObjectURL` 미리보기 + 제거 버튼), 본문 공백이면 보내기 비활성, 제출 중 비활성(더블 제출 방지), 실패 toast 분기(`invalid_input` vs 일반), 성공 시 인라인 "전달됐어요" + 마이페이지 복귀 링크.
- 클라이언트 컴포넌트 단위 테스트는 작성하지 않는다 — 모바일 viewport 수동 검증으로 커버(레포 관행, `action-form.tsx` 동형).
- WP 종결 검증 = plan Task 9: 전체 게이트 + `pnpm build`(`/me/feedback` route 출력) + 수동 시나리오 + RLS 실측. Slack 도착 확인은 `.env.local` 설정 시에만(미설정이면 skip 사유 보고).
- Rollout 운영 단계(Vercel env `SLACK_FEEDBACK_WEBHOOK_URL` 설정 — #qa Incoming Webhook 발급)는 머지 후 수동 작업 — 종료 보고 "미해결/후속 액션"에 반드시 기재.

## Non-goals

- 다중 사진 첨부(1장 고정) · 개발자 답변/2-way 스레드 · 앱 내 제출 이력 화면(spec §Out of scope).
- 서버 rate limit — 제출 중 버튼 비활성만.
- 분석 이벤트 추가 없음 — `AnalyticsEvent` union 불변.
- storage 헬퍼·Slack notify·Server Action 수정 — EVAL-0028 산출물 소비만.
- Vercel env 실값 설정 — 운영 후속(보고에만 기재).

## Acceptance Criteria

| 기준                                                                | 검증 방법                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/me` 진입 행 → `/me/feedback` 이동                                 | 모바일 viewport 수동 (spec §Verification)                                      |
| 폼 동작 — 빈 본문 비활성·카운터·사진 미리보기/제거·제출 중 비활성·성공 상태 | 모바일 viewport 수동 시나리오 전체 통과                                  |
| 제출 → feedback row 생성 (사진 시 `photo_path` + Storage 객체)      | Supabase Studio 실측                                                            |
| 전체 게이트 green                                                   | `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:docs` 전부 PASS     |
| 빌드 + 신규 route                                                   | `pnpm build` 성공, `/me/feedback` route 출력 확인                              |
| RLS 실측 — anon INSERT 거부·타인 user_id INSERT 거부·SELECT 0 rows  | SQL Editor 역할별 실측 (spec §Verification)                                    |
| harness traceability                                                | `pnpm harness:check` 통과                                                       |

## Verification Commands

```bash
pnpm harness:context EVAL-0029
pnpm typecheck && pnpm lint
pnpm test
pnpm validate:docs
pnpm build
pnpm harness:check
# manual: 모바일 viewport 수동 시나리오 — /me 진입 → 작성 → 사진 첨부 → 제출 → 성공 상태 (spec §Verification)
# manual: RLS 실측 — anon INSERT 거부 · authenticated 타인 user_id INSERT 거부 · authenticated SELECT 0 rows
# manual: SLACK_FEEDBACK_WEBHOOK_URL 설정 시 #qa 도착 + 사진 signed URL 열람 (미설정 시 skip 사유 보고)
```

## Expected Output Summary

페이지·폼·진입점 위치, 수동 시나리오·RLS 실측 결과(pass/fail/skip + 사유), `pnpm build` route 출력, Rollout 운영 후속(Vercel env 설정)을 "미해결/후속 액션"에 명시해 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답 — drift 루프 입력)

1. Did this task introduce a new folder structure? (답은 구현 시 작성)
2. Did this task introduce a new naming convention? (답은 구현 시 작성)
3. Did this task introduce a new dependency? (답은 구현 시 작성)
4. Did this task change verification commands? (답은 구현 시 작성)
5. Did this task reveal that the current harness instructions are outdated? (답은 구현 시 작성)
6. Should any `.agents/` document be updated? (답은 구현 시 작성)
   → 하나라도 yes면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition

- 모든 Acceptance Criteria green(수동 항목은 실측 보고) + Verification 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 폼 UI / 진입점 / 종결 검증으로 split(05 §9.4).
