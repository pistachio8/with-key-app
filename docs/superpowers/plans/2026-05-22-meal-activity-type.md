---
plan: 2026-05-22-meal-activity-type
title: Meal Activity Type 신설 — 키워드 풀 v1.1 release
author: pistachio8
date: 2026-05-22
status: draft
---

## 목표

POC dogfood 멤버 다수 요청에 따라 새 activity type `meal` 을 추가한다. 기존 4 종(`running` · `gym` · `yoga` · `other`)에 `meal` 카테고리 + 12 개 키워드 추가 + analytics `poolVersion` marker 로 분석 무결성 보존.

근거 문서: [ADR-0015](../../adr/0015-meal-activity-type.md) · [spec 2026-05-22-meal-activity-type](../specs/2026-05-22-meal-activity-type.md).

## 영향 범위

- **변경 경로**:
  - 신규: `supabase/migrations/0032_meal_activity_type.sql` · `docs/adr/0015-meal-activity-type.md` · `docs/superpowers/specs/2026-05-22-meal-activity-type.md` · 본 plan
  - 수정: `src/lib/keywords/pool.ts` · `src/lib/analytics/schema.ts` · `src/lib/analytics/track.ts`(또는 호출처) · `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` · `AGENTS.md §3` · `docs/PRD.md §4.6` · `docs/VALIDATION.md`
- **데이터/RLS 영향**: `action_logs.activity_type` CHECK 제약 갱신 (RLS 정책 영향 없음 — 컬럼 값 허용 범위만 확장). migration 단방향(POC 정책).
- **외부 서비스**: 없음.
- **재사용 후보**: 기존 `validators/action-log.ts` 의 `z.enum(ACTIVITY_TYPES)` 가 자동으로 `meal` 포함. `keyword-chip-group.tsx` 는 activityType 별 분기 없이 동일 동작.

## 작업 단계

각 단계는 검증이 가능해야 함. 단계 6~14 는 한 commit 으로 묶지 않고 논리 단위 분리.

1. **브랜치 끊기** — `feat/meal-activity-type` (base: develop) → 검증: `git branch --show-current`
2. **DB schema 점검** — `supabase/migrations/0001_init.sql:94` 의 CHECK 제약 확인. **확인됨 → migration 필요**.
3. **ADR 작성** — `pnpm new adr meal-activity-type` → `docs/adr/0015-meal-activity-type.md` 본문 작성 → 검증: `pnpm validate:docs`
4. **spec 작성** — `pnpm new spec meal-activity-type` → `docs/superpowers/specs/2026-05-22-meal-activity-type.md` 본문 작성 → 검증: `pnpm validate:docs`
5. **plan 작성** — 본 문서 (자기 참조).
6. **migration 0032 작성** — `supabase/migrations/0032_meal_activity_type.sql`: action_logs.activity_type CHECK 에 `'meal'` 추가. drop + add 패턴 → 검증: 본 PR 머지 후 production 적용.
7. **pool.ts 변경** — ACTIVITY_TYPES 에 `"meal"` 추가, KEYWORD_POOL.meal = [12개 키워드], `export const KEYWORD_POOL_VERSION = "v1.1-meal-2026-05-22" as const` → 검증: `pnpm typecheck`
8. **action-form.tsx UI 변경** — ACTIVITY_LABELS 에 `meal: "🥗 식단"`, legend "운동 종류" → "활동 종류", radiogroup aria-label 동일 → 검증: dev 시각 (모바일/데스크탑 viewport)
9. **analytics/schema.ts 변경** — `keywords_shown` · `action_logged` props 에 `poolVersion: z.string()` 추가 → 검증: `pnpm typecheck` 시 호출처 type error → 다음 단계로
10. **analytics 호출처 inject** — action-form.tsx (또는 action-form 내부 \_actions.ts) 의 track 호출에 `poolVersion: KEYWORD_POOL_VERSION` 명시 → 검증: `pnpm typecheck` 통과
11. **AGENTS.md §3 §키워드 풀 갱신** — "POC 기간 변경 금지" → "v1.0 freeze · v1.1 release 2026-05-22 · 이후 추가 변경 금지" 표현 → 검증: 문맥 점검
12. **PRD §4.6 갱신** — "운동 4종 × 12~18개" → "활동 5종 (운동 4 + 식단 1) × 12~18개" → 검증: 문맥 점검
13. **VALIDATION.md poolVersion 분기점 노트** — 분석 SQL 패턴 1~2 줄 추가 → 검증: 문맥 점검
14. **종합 검증** — `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:docs` → 모두 통과
15. **dev 시각 확인** — `/action` 화면에서 5 segment wrap (모바일 375 + 데스크탑 1280), "🥗 식단" 라벨, 12 키워드 chip 시각 확인 → 통과
16. **commit 분리** — (a) docs(meal): ADR + spec + plan (b) feat(keywords): meal + v1.1 marker + UI + migration (c) refactor(analytics+docs): poolVersion + AGENTS/PRD/VALIDATION 동기
17. **push + PR** — `gh pr create --base develop`, 본문 한국어, viewport 체크리스트

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
# migration 적용 검증 (선택, 로컬 supabase 사용 시):
pnpm supabase db reset
```

수동 확인 항목:

- [ ] dev 서버에서 `/action` 진입 → 5 segment "🏃 러닝 / 🏋️ 헬스 / 🧘 요가 / ✨ 기타 / 🥗 식단" wrap 정상
- [ ] "🥗 식단" 선택 시 12 개 키워드 chip 표시
- [ ] 인증 완료 시 `action_logged` 이벤트에 `activityType: "meal"` + `poolVersion: "v1.1-meal-2026-05-22"` 포함되는지 dev tools network 또는 supabase events 테이블 확인
- [ ] 모바일 375px viewport 에서 5 segment 가독성
- [ ] 데스크탑 1280px viewport 에서 정상

## 리스크 / 미해결

- **분석 데이터 분기점**: `poolVersion` marker 가 추가되기 전 emit 된 이벤트는 `poolVersion` 필드 없음. 분석 SQL 에서 `is null or = 'v1.0'` 패턴 권장 — VALIDATION.md 에 노트.
- **with-key 정체성 표현**: AGENTS.md §1 "그룹 운동 각서 앱"은 본 PR 에서 안 건드림. PO 의사 재확인 후 별도 결정.
- **인증 빈도 정책**: 운동은 일 1 회 인증, 식이는 끼니별일 수 있음. 본 PR 은 키워드 풀 범위만 — 인증 빈도는 별도 PRD/spec 결정.
- **migration production 적용 timing**: 머지 후 즉시 적용. roll forward only (POC 정책).
- **모킹업 §10-A 갱신**: 4 segment → 5 segment 시각 갱신은 선택적. 현재 모킹업은 운동 4 종 기준이라 부정합. 별도 작업 또는 본 PR 안에서 §10-A note 갱신.

## 비범위

- AGENTS.md §1 정체성 표현 변경
- challenge 인증 빈도 정책 (식이 끼니별 vs 일 1 회)
- 5 개 키워드 이벤트 중 `keywords_reroll` · `keyword_selected` · `memo_fallback_opened` 에 poolVersion 추가
- 자동 inject 헬퍼 함수 (spec C3 옵션 B) — 채택 안 함
- 모킹업 §10-A 5 segment 시각 갱신 (선택)
- `v_keyword_usage` SQL 뷰 정의 자체 추가 (별도 작업)
