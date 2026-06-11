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

사용자가 실제로 건의를 보낼 수 있게 되고 WP가 닫힌다. 세 하위 목표로 구성된다(plan Task 7·8·9 대응):

**G1 — /me/feedback 페이지 + 폼 (plan Task 7)**
`/me/feedback` 페이지(RSC `requireUser` 게이트)와 클라이언트 폼(카테고리 Select·본문 Textarea 글자 카운터·사진 첨부 `prepareForUpload` 전처리/미리보기/제거·제출 중 비활성·인라인 성공 상태)이 EVAL-0028의 `submitFeedback`을 호출한다.

- done 기준: `pnpm typecheck && pnpm lint` PASS + `pnpm build`에서 `/me/feedback` route 출력 확인.

**G2 — /me 진입 행 추가 (plan Task 8)**
`/me`에 건의하기 진입 행(`<FeedbackLink />`)이 `<LegalLinks />` 바로 위에 추가된다.

- done 기준: 모바일 viewport 수동 확인 — `/me` 진입 행 → `/me/feedback` 이동 성공.

**G3 — WP 종결 검증 (plan Task 9)**
전체 게이트(typecheck·lint·test·validate:docs·build) + 모바일 viewport 수동 시나리오 + RLS 실측(anon/타인 INSERT 거부·authenticated SELECT 0 rows)이 spec §Verification 대로 통과한다.

- done 기준: 모든 게이트 green(수동 항목은 실측 결과 보고) + `pnpm harness:check` 통과.

EVAL-0028의 `submitFeedback` 계약이 확정돼 있어야 착수 가능.

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

구현 상세는 plan Task 7·8·9(SoT)을 따른다. 핵심 결정만 기록:

- G1: 카테고리 기본 `bug`, 본문 1000자 카운터, 사진 1장(클라 검증 → `prepareForUpload` → 미리보기), 공백 비활성, 제출 중 비활성, 성공 시 인라인 "전달됐어요". 클라이언트 컴포넌트 단위 테스트 없음 — 수동 검증 커버.
- G2: `<FeedbackLink />` → `<LegalLinks />` 바로 위 배치.
- G3: 전체 게이트 + `pnpm build` + 수동 시나리오 + RLS 실측. Slack 확인은 `.env.local` 설정 시에만. Rollout(Vercel env 설정)은 머지 후 수동 — "미해결/후속"에 기재.

## Non-goals

- 다중 사진·2-way 스레드·이력 화면(spec §Out of scope).
- 서버 rate limit(버튼 비활성으로 충분).
- `AnalyticsEvent` 추가 없음.
- storage·Slack·Server Action 수정 — EVAL-0028 소비만.
- Vercel env 설정 — 운영 후속.

## Acceptance Criteria

| 기준                                            | 검증                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `/me` 진입 행 → `/me/feedback` 이동             | 모바일 수동                                                      |
| 폼 동작 전체 (비활성·카운터·사진·성공 상태)     | 모바일 수동 시나리오                                             |
| 제출 → feedback row + photo_path                | Supabase Studio 실측                                             |
| 전체 게이트 green                               | `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:docs` |
| `pnpm build` + `/me/feedback` route 출력        | `pnpm build`                                                     |
| RLS 실측 (anon·타인 INSERT 거부, SELECT 0 rows) | SQL Editor 역할별                                                |
| harness traceability                            | `pnpm harness:check`                                             |

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

1. New folder structure?
2. New naming convention?
3. New dependency?
4. Verification commands changed?
5. Harness instructions outdated?
6. `.agents/` update needed?
   → yes 있으면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition

**정상 종료(done)**: G1·G2·G3 done 기준 충족 + Verification Commands green(수동 항목은 실측 보고) + Harness Impact 답변 완료.

**중단·에스컬레이션**:

- `submitFeedback` 시그니처가 EVAL-0028 명세와 다르면 → 폼 구현 중단, 재확인 후 보고.
- RLS 실측 실패 시 → UI 우회 금지, 즉시 중단·보고(EVAL-0027 migration 재확인).
- `pnpm build` 실패가 기존 파일 영향이면 → 범위 초과, 중단·보고.
- `requireUser` 게이트 누락 시 → 보안 위반, 즉시 중단·보고.

**split 기준**: pass@3 미달 시 G1/G2/G3 단위 분할.
