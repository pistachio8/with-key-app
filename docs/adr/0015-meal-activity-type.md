# ADR-0015-meal-activity-type: Meal Activity Type 신설 (키워드 풀 v1.1)

**Date**: 2026-05-22
**Status**: proposed
**Deciders**: pistachio8 (PO 의사 — dogfood 멤버 다수 요청)

## Context

with-key 는 **그룹 운동 각서 앱** 으로 시작했고, `src/lib/keywords/pool.ts` 의 `ACTIVITY_TYPES` 는 `running` · `gym` · `yoga` · `other` 4 종 운동 카테고리로 freeze 되어 있었다 (PRD §4.6 · AC-10 · §692 Risk).

POC dogfood 진행 중 멤버들로부터 **"샐러드 먹기 챌린지"를 만들 수 있게 해달라**는 요청이 다수 들어왔다. 가능한 대응은:

1. `other` 키워드 풀에 "샐러드" 같은 단어를 끼우기 — 단 기존 키워드("땀나는 · 기분좋은 · 가벼운 · 힘들었던")가 모두 **운동 보조 감각 표현**이라 식이 명사가 들어가면 톤 부조화.
2. 챌린지 title 자유입력으로 "샐러드 먹기 30일" 같은 챌린지를 만들 수는 있지만, 인증 시 키워드 풀이 운동 위주라 UX 어색.
3. **새 activity type 신설** — 도메인 자체를 운동 → 운동+식이 로 확장.

이 결정은 PRD §4.6 의 "**POC 기간 변경 금지**" 룰과 충돌하므로 ADR 로 명시 기록 + AGENTS.md 가드레일 갱신 + VALIDATION.md 분기점 노트가 필요하다.

## Decision

**`meal` activity type 을 신설하고, 키워드 풀을 v1.0 → v1.1 로 release 한다.**

- 새 카테고리: `meal` · 한국어 라벨 **"🥗 식단"**
- 키워드 12개 (모두 긍정 톤 — 기존 4 카테고리와 정합):
  `샐러드` · `단백질` · `야채듬뿍` · `집밥` · `한그릇` · `정성차림` · `탄단지` · `느린식사` · `물한잔` · `건강한맛` · `도시락` · `함께먹는`
- 적용 시점: **즉시**. 분석 무결성은 `KEYWORD_POOL_VERSION = "v1.1-meal-2026-05-22"` 상수 + analytics 이벤트(`keywords_shown` · `action_logged`)에 `poolVersion` 필드 추가로 데이터 분기점 명시.
- DB 제약: `supabase/migrations/0032_meal_activity_type.sql` 로 `action_logs.activity_type` CHECK 에 `'meal'` 추가.
- 후속 가드레일: AGENTS.md §3 §키워드 풀 룰 갱신 ("v1.0 freeze · v1.1 release 2026-05-22 · 이후 추가 변경 금지"), PRD §4.6 표현 갱신 ("운동 4종" → "활동 5종"), VALIDATION.md 에 분기점 노트 추가.

## Alternatives Considered

### 1. `other` 카테고리에 "샐러드먹기" 같은 키워드 1~2개만 추가

- **Pros**: 변경량 최소, migration 불필요.
- **Cons**: 기존 `other` 키워드는 운동 감각 표현("땀나는 · 기분좋은") 위주라 식이 행위 명사가 들어가면 톤 부조화. 카테고리 정체성 약화.
- **Why not**: dogfood 요청은 "샐러드 먹기 **챌린지**"라는 카테고리 수준 요구. 키워드 1개로는 만족 불가.

### 2. 챌린지 title 자유입력 + `other` 활동 타입으로 처리

- **Pros**: 코드 변경 0.
- **Cons**: 챌린지 이름은 "샐러드 먹기 30일"이지만 인증 시 키워드는 운동 보조 표현만 노출 — UX 일관성 깨짐. AI 일기 생성 시 운동 키워드를 식이 행위에 맞추려는 시도가 부자연스러운 결과 생성 가능.
- **Why not**: dogfood 멤버들이 "할 수 있게 해달라"고 한 건 챌린지 제목 입력이 아니라 카테고리 자체. UX 만족도 ↓.

### 3. POC 종료 후 v1.1 release point 까지 미룸

- **Pros**: PRD §692 "Week 2 중 풀 수정 금지(분석 편향)" 정칙 준수, 분석 데이터 100% 보존.
- **Cons**: dogfood 멤버 요청 무시 → 참여 동력 감소, 피드백 신뢰 손상.
- **Why not**: `poolVersion` 데이터 분기점 marker 로 분석 무결성을 보존하면서도 즉시 release 가능 — 사용자 가치와 분석 가치 모두 잡는 절충.

### 4. `habit` (생활 습관 — 식이+물+수면+영양제) 같은 광범위 카테고리

- **Pros**: 미래 확장성 ↑, 한 카테고리로 여러 행위 흡수.
- **Cons**: 키워드 분포가 흩어져 분석 가치 ↓. 카테고리 정체성 모호.
- **Why not**: dogfood 요청이 명확히 "샐러드/식이" 도메인이고, with-key 의 "각서" 정체성에 맞추려면 카테고리가 좁고 명확해야 함.

## Consequences

### 긍정적

- dogfood 멤버 요청 즉시 대응 — 참여 동력 유지.
- `meal` 카테고리로 식이 챌린지 (샐러드·집밥·도시락·물 마시기 등) 모두 정합한 UX 제공.
- `KEYWORD_POOL_VERSION` 상수 + analytics `poolVersion` 으로 향후 추가 release 시에도 분석 분기 가능 — 운영 패턴 확립.

### 부정적 / 비용

- VALIDATION.md GO/NO-GO 지표 (키워드 사용 분포 · 편집률 · keywordCoverage) 분석 시 `poolVersion` 으로 split 필수 — 분석 복잡도 ↑.
- with-key 정체성 "그룹 운동 각서 앱"이 식이 도메인까지 포함하게 됨 — AGENTS.md §1 표현은 본 ADR 범위 밖이지만 향후 PO 검토 필요.
- DB migration 추가 — 머지된 migration 은 production 에 즉시 적용 (POC 단방향 정책).

### 후속 영향

- **본 PR 안에서**: AGENTS.md §3 §키워드 풀 갱신, PRD §4.6 갱신, VALIDATION.md 분기점 노트, 모킹업 §10-A 갱신 (선택), action-form.tsx UI 갱신, analytics/schema.ts spec.
- **후속 PR/결정**: AGENTS.md §1 정체성 표현 변경 여부, challenge 인증 빈도 정책 (식이는 끼니별 가능성), `meal` 키워드 추가 release 시점 정책.
- **분석 가이드**: `v_keyword_usage` · `v_ai_health` 뷰는 `poolVersion` 으로 group_by 또는 where 필터 추가 필요.
