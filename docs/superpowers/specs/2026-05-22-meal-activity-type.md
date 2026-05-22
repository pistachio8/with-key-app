---
spec: 2026-05-22-meal-activity-type
title: Meal Activity Type — 키워드 풀 v1.1 release 와 analytics poolVersion 분기점
author: pistachio8
date: 2026-05-22
status: draft
---

## Summary

[ADR-0015](../../adr/0015-meal-activity-type.md) 의 결정에 따라 새 activity type `meal` 을 추가하면서, 분석 무결성 보존을 위해 키워드 풀 버전 분기점을 analytics 에 명시한다. 본 spec 은 **analytics schema 변경** (spec-required 경로 `src/lib/analytics/track.ts`) 의 설계 결정을 기록한다.

핵심: `KEYWORD_POOL_VERSION = "v1.1-meal-2026-05-22"` 상수를 `src/lib/keywords/pool.ts` 에 정의하고, `keywords_shown` · `action_logged` 두 이벤트의 props 에 `poolVersion: z.string()` 을 추가한다. 호출처에서 명시적으로 inject (validator schema 차원에서 missing 시 type error).

## Why

- POC dogfood 진행 중 키워드 풀을 v1.0 → v1.1 로 release 하므로 VALIDATION.md 의 GO/NO-GO 지표 (`v_keyword_usage` · `v_ai_health` · 키워드 사용 분포 · 편집률 · keywordCoverage) 가 두 데이터 셋이 섞이면 분석 불가.
- 단순히 데이터 timestamp 로 분기하는 방법도 있지만, release timestamp 가 (a) deploy 지연 (b) cache 만료 시점차 (c) 다중 환경(dev/staging/prod) 차이 등으로 정확하지 않음. 명시적 marker 가 robust.
- 5 개 키워드 이벤트(`keywords_shown` · `keywords_reroll` · `keyword_selected` · `memo_fallback_opened` · `action_logged`) 중 분석 가치가 가장 큰 **노출(`keywords_shown`)과 사용(`action_logged`) 두 곳에만** marker 추가 — 다른 이벤트는 같은 session 안에서 시간 join 가능.
- `pool.ts` 한 곳에서 상수 정의 → 호출처에서 import → analytics track 시 명시 inject. 향후 추가 release (v1.2, v2 등) 시에도 상수 한 줄 갱신으로 대응.

## Impact Scope

### 변경 경로

- 신규: 없음 (analytics 신규 이벤트 추가 안 함)
- 수정:
  - `src/lib/keywords/pool.ts` — `KEYWORD_POOL_VERSION` 상수 export (ADR-0015 의 §Decision 후속)
  - `src/lib/analytics/schema.ts` — `keywords_shown` · `action_logged` 두 이벤트 props 에 `poolVersion: z.string()` 추가
  - `src/lib/analytics/track.ts` — track 호출처 시그니처 또는 호출처에서 명시 inject

### src/ 영향

- `src/lib/keywords/pool.ts` — 상수 추가 + ACTIVITY_TYPES 변경 (`meal` 추가)
- `src/lib/analytics/schema.ts` — 2 events 의 props zod schema 갱신
- `src/lib/analytics/track.ts` — track 함수 시그니처 또는 자동 inject 로직
- 호출처 (`src/app/(app)/challenge/[id]/action/_components/action-form.tsx`, `src/app/(app)/challenge/[id]/action/_actions.ts`) — track 호출에 `poolVersion` 인자 추가

### Supabase / RLS / migration 영향

`src/lib/keywords/pool.ts` 변경의 후속으로 `supabase/migrations/0032_meal_activity_type.sql` 추가 — `action_logs.activity_type` CHECK 제약에 `'meal'` 포함. 본 spec 의 analytics 변경 자체는 DB 영향 없음 (analytics 이벤트는 `events` 테이블에 jsonb props 로 저장).

### 외부 서비스

없음. OpenAI · Web Push 영향 없음.

## Design

### C1. `KEYWORD_POOL_VERSION` 상수

```ts
// src/lib/keywords/pool.ts (추가)
export const KEYWORD_POOL_VERSION = "v1.1-meal-2026-05-22" as const;
```

- 형식: `v<major>.<minor>-<change-summary>-<YYYY-MM-DD>`.
- `as const` 로 literal type 유지 — 분석 시점에 typo 검출 가능.
- 향후 추가 release 시 한 줄 갱신 (예: `v1.2-keywords-tune-2026-07-01`).

**왜 한 상수**: pool.ts 가 키워드 SoT 이므로 버전도 같은 파일에 두는 게 자연스러움. 다른 파일에서 정의하면 release 시점에 동기화 누락 위험.

### C2. analytics schema 변경

```ts
// src/lib/analytics/schema.ts
z.object({
  name: z.literal("keywords_shown"),
  props: z.object({
    activityType,
    shownKeywords: z.array(z.string()).min(1),
    source: z.enum(["initial", "reroll"]),
    poolVersion: z.string(),  // 추가
  }),
}),
z.object({
  name: z.literal("action_logged"),
  props: z.object({
    challengeId: uuid,
    activityType,
    selectedKeywords: z.array(z.string()).min(1),
    keywordCount: z.number().int().min(1).max(3),
    hasMemo: z.boolean(),
    rerollCount: z.number().int().min(0).max(5),
    photoSize: z.number().int().min(0),
    photoAttached: z.boolean(),
    poolVersion: z.string(),  // 추가
  }),
}),
```

**왜 `z.string()` 이지 `z.literal(KEYWORD_POOL_VERSION)` 이 아닌가**: 향후 release 시 schema 도 바꾸지 않게 generic string. release 시점이 다르거나 cache 가 옛 버전을 emit 하는 경우도 robust 하게 수용.

### C3. track 호출 패턴

두 가지 옵션:

**옵션 A — 호출처에서 명시 inject**:

```ts
// action-form.tsx
track({
  name: "keywords_shown",
  props: { activityType, shownKeywords, source: "initial", poolVersion: KEYWORD_POOL_VERSION },
});
```

**옵션 B — track.ts 내부에서 자동 inject** (helper 함수가 KEYWORD_POOL_VERSION 을 import 해 자동 추가):

```ts
// track.ts
export function trackKeywordsShown(...) {
  return track({ ..., props: { ..., poolVersion: KEYWORD_POOL_VERSION } });
}
```

**채택: 옵션 A (호출처 명시)**. 이유:

- zod schema 가 `poolVersion: z.string()` 필수로 강제 — 호출처에서 빠뜨리면 type/runtime error. 자동 inject 는 schema 가 호출 패턴을 가정하게 됨.
- analytics 호출은 발생 위치가 명확해야 디버깅 가능. 자동 inject 는 "어디서 값이 들어왔는지" 불투명.
- 호출처 4~5곳이라 boilerplate 부담 작음.

### C4. analytics 분석 가이드

`v_keyword_usage` · `v_ai_health` 같은 뷰가 정의되어 있다면 (또는 향후 추가 시):

```sql
-- v1.1 이후만 분석 (식이 데이터 포함)
select * from v_keyword_usage where props->>'poolVersion' = 'v1.1-meal-2026-05-22';

-- v1.0 baseline 만 분석 (운동 한정)
select * from v_keyword_usage where props->>'poolVersion' is null
   or props->>'poolVersion' = 'v1.0';
```

VALIDATION.md 에 SQL 패턴 명시 추가.

## Alternatives Considered

### 1. 별도 `pool_version_marker` 이벤트 emit on app boot

- **Pros**: 다른 이벤트에 schema 변경 없음, 한 곳에 marker.
- **Cons**: 분석 시 marker 이벤트와 다른 이벤트를 시간 join — 사용자 session 경계 불명확. release 시점 ±수 분 오차로 분기 부정확.
- **Why not**: 명시 marker 가 robust.

### 2. 모든 5 개 키워드 이벤트에 `poolVersion` 추가

- **Pros**: 일관성 100%.
- **Cons**: schema 부풀음, boilerplate 4 곳 추가 (`keywords_reroll` · `keyword_selected` · `memo_fallback_opened` 는 같은 session 의 `keywords_shown` 와 join 가능 — 단순 join 으로 분기 충분).
- **Why not**: 가장 분석 가치 큰 2 곳에만 marker 가 sweet spot.

### 3. timestamp 기반 분기 (release time 이후/이전)

- **Pros**: 코드 변경 0.
- **Cons**: deploy 지연 · cache 만료 · 다중 환경 차이로 정확하지 않음. analytics 분석 SQL 가 release timestamp 를 hardcode 해야 함 — 운영 추가 시 매번 SQL 수정.
- **Why not**: 명시 marker 가 운영 부담 적고 정확.

## Verification

### 명령

```bash
pnpm typecheck      # zod schema + 호출처 type 일치 확인
pnpm lint
pnpm test           # analytics events-insert.spec.ts 가 poolVersion 포함 검증
pnpm validate:docs
```

### 시나리오

**정상 케이스**:

- `/action` 진입 → `keywords_shown` 이벤트 props 에 `poolVersion: "v1.1-meal-2026-05-22"` 포함되어 `events` 테이블에 저장.
- 인증 완료 → `action_logged` 이벤트도 동일 `poolVersion` 포함.
- 5 개 type segment 중 "🥗 식단" 선택 시 동일 marker.

**엣지 케이스**:

- KEYWORD_POOL_VERSION 상수 누락 시 typescript build error (zod schema 가 z.string() 필수).
- 호출처에서 `poolVersion` 인자 누락 시 type error.
- runtime 에서 zod 가 invalid event 를 reject — `tests/integration/analytics/events-insert.spec.ts` 패턴 그대로 동작.

## Rollout

1. `pool.ts` 에 `KEYWORD_POOL_VERSION` 상수 + `meal` 카테고리 추가 → typecheck 통과.
2. `analytics/schema.ts` 에 `poolVersion` field 추가 → 호출처 type error 발생.
3. 호출처 4~5 곳 (action-form.tsx 의 trackKeywordsShown, action-form.tsx 의 trackActionLogged 등) 에 `poolVersion: KEYWORD_POOL_VERSION` inject → type error 해소.
4. 검증 명령 통과 → PR.

### 롤백

- 1 commit revert: schema 변경과 호출처 inject 를 한 commit 으로 묶으면 revert 시 자동으로 분리됨.
- DB events 테이블에 이미 저장된 `poolVersion` 값은 그대로 (jsonb 라 schema 변경 비파괴).

## Out of scope

- VALIDATION.md 의 분석 뷰 자체 변경 (별도 작업, 본 spec 은 analytics emit 만 다룸)
- 5 개 키워드 이벤트 중 나머지 3 개에 poolVersion 추가
- 자동 inject 헬퍼 함수 (옵션 B) — 채택 안 함, 명시 inject 유지
- `pool_version_marker` 신규 이벤트
- `v_keyword_usage` SQL 뷰 정의 자체 (현재 없을 수 있음, 별도 도입 시점 결정)

## 용어집

- **ADR (Architecture Decision Record)**: 되돌리기 비용이 큰 결정의 짧은 기록. `docs/adr/` 운영.
- **keyword pool**: `src/lib/keywords/pool.ts` 의 ACTIVITY_TYPES × 각 12 개 키워드 SoT.
- **poolVersion marker**: analytics 이벤트 props 에 추가하는 `KEYWORD_POOL_VERSION` 값 — 분석 시 데이터 셋 분기점.
- **spec-required 경로**: 변경 시 `docs/superpowers/specs/` 또는 `docs/adr/` 문서를 함께 추가해야 하는 7 개 경로 (AGENTS.md §4).
