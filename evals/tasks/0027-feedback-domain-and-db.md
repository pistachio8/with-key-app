---
Task: EVAL-0027
Track: greenfield
Kind: migration
Status: todo
Parent: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md, docs/superpowers/plans/2026-06-10-feedback-suggestion.md
---

# EVAL-0027: 건의 데이터 레이어 — feedbackSchema validator + migration 0047 + ADR·BE_SCHEMA·env 문서

> WP-feedback (`feat/feedback-suggestion`, develop 1 PR). 외부 게이트 없음 → `todo`. plan Task 1·2·3 묶음(데이터 레이어). Slack env 설정은 코드를 blocked 시키지 않는 운영 후속.
> ADR 번호: 0034는 `rn-kakao-native-auth`로 선점됨 → 본 태스크 ADR은 **0035** (`0035-feedback-table-storage.md`).

## Parent Links

- Parent PRD Feature: PRD AC 없음 — dogfood 운영 기능, spec이 AC SoT — [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md) §Verification
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: JS 인스턴스 없음(스코프 밖) — 의도는 spec §Why 참조: [2026-06-10-feedback-suggestion-design.md](../../docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md)
- Parent Engineering Story: ES 인스턴스 없음(스코프 밖) — 구현 계획이 대행: [2026-06-10-feedback-suggestion.md](../../docs/superpowers/plans/2026-06-10-feedback-suggestion.md) Task 1·2·3
- Parent Work Package: `feat/feedback-suggestion` (WP-feedback)

## Goal

건의 제출의 데이터 토대가 고정된다. 세 하위 목표로 구성된다(plan Task 1·2·3 대응):

**G1 — validator (plan Task 1)**
`@withkey/domain`에 `feedbackSchema`(카테고리 enum + 본문 1~1000자 trim) zod SoT가 barrel export로 존재한다.

- done 기준: `pnpm --filter @withkey/domain test -- feedback` 6개 green + `pnpm typecheck` 통과(index.ts export 포함).

**G2 — migration (plan Task 2)**
migration `0047_feedback.sql`이 `feedback` 테이블(INSERT-only RLS) + private `feedback-photos` 버킷(owner-scoped RLS) + `truncate_test_data` 재발행(0012 정의 전문 기반)을 append-only 마지막 번호로 정의한다.

- done 기준: `ls supabase/migrations/ | tail -3`에서 `0047_feedback.sql`이 마지막 + `allow_delete_query` 플래그 포함 grep 확인.

**G3 — 문서 동기화 (plan Task 3)**
ADR-0035(`0035-feedback-table-storage.md`)·BE_SCHEMA(13번째 테이블)·`.env.example`(`SLACK_FEEDBACK_WEBHOOK_URL` 서버 전용 주석)이 동기화된다.

- done 기준: `pnpm validate:docs` 통과 + BE_SCHEMA §2 표 "13개" 확인.
- ADR 번호: 0034는 `rn-kakao-native-auth`로 선점 → **0035** 사용.

서버/UI 코드는 작성하지 않는다(EVAL-0028·0029).

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md` (§C1 테이블·§C2 버킷·§C3 validator)
- `docs/superpowers/plans/2026-06-10-feedback-suggestion.md` (Task 1·2·3 — 테스트·SQL·문서 본문)
- `packages/domain/src/validators/action-log.ts` (기존 validator 패턴)
- `packages/domain/src/validators/index.ts` (barrel — 알파벳 순서)
- `supabase/migrations/0011_storage_action_photos.sql` (버킷 + owner-scoped storage RLS 동형 패턴)
- `supabase/migrations/0012_truncate_storage_allow_delete.sql` (`truncate_test_data` 정의 SoT — 재발행 기반, `storage.allow_delete_query` 플래그 보존 필수)
- `docs/BE_SCHEMA.md` (§2 인벤토리·§5 컬럼·§7 RLS·§12 Changelog)
- `apps/web/.env.example` (Slack 블록 주석 스타일)

## Target Files

- `packages/domain/src/validators/` — 신규 `feedback.ts` + `feedback.spec.ts`, `index.ts` export 1줄 추가 (G1)
- `supabase/migrations/` — 신규 `0047_feedback.sql` (append-only 마지막 번호) (G2)
- `docs/adr/` — 신규 `0035-feedback-table-storage.md` (migration 동반 ADR, spec-required; ADR-0034는 `rn-kakao-native-auth`로 선점) (G3)
- `docs/BE_SCHEMA.md` — §2 표 13번째 행(+표 제목 13개) · §5.11 `feedback` 컬럼 · §7 RLS 요약 1줄 · §12 Changelog (G3)
- `apps/web/.env.example` — `SLACK_FEEDBACK_WEBHOOK_URL` 서버 전용 주석 블록 (G3)

## Requirements

- `feedbackSchema` = plan Task 1 코드 그대로: `FEEDBACK_CATEGORIES = ["bug","feature","other"]` enum + `body` trim 1~1000자, `FeedbackInput`/`FeedbackCategory`는 `z.infer<>` 도출. 테스트 6개(plan Task 1 Step 1) RED→GREEN.
- `0047_feedback.sql` = plan Task 2 SQL 그대로: feedback 테이블(check 제약이 zod와 1:1) + RLS INSERT-only(`with check (user_id = auth.uid())`, SELECT/UPDATE/DELETE 정책 없음) + feedback-photos 버킷(5MB·jpeg/png/webp) + storage.objects owner-scoped 3정책 + `truncate_test_data` 재발행은 **0012 전문 기반**(0011 기반 금지 — `storage.allow_delete_query` 플래그 누락 시 함수 실패).
- ADR-0035 = plan Task 3 본문(INSERT-only·신규 버킷·업로드 선행·signed URL 72h·0012 기반 재발행 5개 결정 + truncate 잠복 결함 인지 기록). 파일명 `0035-feedback-table-storage.md`(ADR-0034는 `rn-kakao-native-auth`로 선점됨).
- BE*SCHEMA·.env.example 갱신은 plan Task 3 Step 2·3 그대로. env 키에 `NEXT_PUBLIC*` 접두 금지.

## Non-goals

- storage 헬퍼·Slack notify·`submitFeedback` Server Action — EVAL-0028.
- `/me/feedback` UI·진입점·RLS 실측·모바일 수동 검증 — EVAL-0029.
- 분석 이벤트 추가 없음 — `AnalyticsEvent` union 불변(spec §Why).
- `truncate_test_data`의 기존 잠복 결함(point_ledger·settlements 미정리) forward-fix — 범위 외, ADR에 인지만 기록.
- DB Webhook 릴레이(spec 대안 3 — v1 백로그).

## Acceptance Criteria

| 기준                                                                  | 검증 방법                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| feedbackSchema zod 테스트 6개 green                                   | `pnpm --filter @withkey/domain test -- feedback` PASS (6 tests)     |
| barrel export — `@withkey/domain`에서 import 가능                     | `pnpm typecheck` 통과 (index.ts export 포함)                        |
| migration append-only — 0047이 마지막 번호                            | `ls supabase/migrations/                                            | tail -3`→`0047_feedback.sql` 마지막 |
| 0047 내용이 plan Task 2 SQL과 1:1 (INSERT-only·버킷·0012 기반 재발행) | 파일 diff 대조 — check 제약·정책명·`allow_delete_query` 플래그 확인 |
| ADR-0035·BE_SCHEMA·env 동기 (링크 무결)                               | `pnpm validate:docs` 통과 + BE_SCHEMA §2 표 "13개"                  |
| harness traceability                                                  | `pnpm harness:check` 통과                                           |

## Verification Commands

```bash
pnpm harness:context EVAL-0027
pnpm --filter @withkey/domain test -- feedback
ls supabase/migrations/ | tail -3
pnpm typecheck && pnpm lint
pnpm validate:docs
pnpm harness:check
```

## Expected Output Summary

validator·migration·ADR 파일 위치, zod ↔ DB check 제약 1:1 동기 지점, INSERT-only RLS 결정과 id 선생성 함정(insert 후 `.select()` 불가), truncate_test_data 0012 기반 재발행 이유, EVAL-0028이 소비할 export 목록을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답 — drift 루프 입력)

1. Did this task introduce a new folder structure? (답은 구현 시 작성)
2. Did this task introduce a new naming convention? (답은 구현 시 작성)
3. Did this task introduce a new dependency? (답은 구현 시 작성)
4. Did this task change verification commands? (답은 구현 시 작성)
5. Did this task reveal that the current harness instructions are outdated? (답은 구현 시 작성)
6. Should any `.agents/` document be updated? (답은 구현 시 작성)
   → 하나라도 yes면 `evals/drift-reports/`에 노트 + check-harness-drift 트리거.

## Stop Condition

**정상 종료(done)**: G1·G2·G3 모두 done 기준 충족 + Verification Commands 전부 green + Harness Impact Questions 답변 완료.

**중단·에스컬레이션**:

- `ls supabase/migrations/ | tail -3` 결과가 `0047_feedback.sql`이 아닌 경우(다른 PR이 0047 선점) → 번호를 `ls supabase/migrations/ | wc -l`로 재확인 후 구현 중단·보고.
- `supabase/migrations/0012_truncate_storage_allow_delete.sql` 전문과 migration 재발행 정의가 불일치하면(특히 `storage.allow_delete_query` 플래그 누락) → 구현 강행 금지, 중단·보고.
- docs/adr/0035-feedback-table-storage.md 파일명으로 생성 시 이미 0035 번호가 선점돼 있으면 → 다음 빈 번호로 교정 후 본 task 본문도 갱신.
- `pnpm validate:docs` FAIL이 신규 파일 외 기존 링크 깨짐이면 → 해당 파일 범위 초과, 중단·보고.

**split 기준(05 §9.4)**: pass@3 미달 시 G1(validator) / G2(migration) / G3(문서) 단위로 분할.
