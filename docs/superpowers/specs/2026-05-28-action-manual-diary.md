---
spec: 2026-05-28-action-manual-diary
title: Action Manual Diary (직접 입력 일기)
author: pistachio8
date: 2026-05-28
status: draft
---

## Summary

챌린지 인증하기 페이지(`/challenge/[id]/action`)에서 사용자가 일기를 **직접 입력**하면 AI 생성을 건너뛰고 입력한 글을 그대로 저장한다. 직접 입력할 때는 **키워드 선택 없이도 제출**할 수 있다.

기존에는 제출 시 항상 `generateDiary`(OpenAI)가 실행되어 결과를 `ai_summary`에 저장했고, "✏️ 직접 쓰고 싶어요" 메모(≤100자)는 AI 프롬프트에 힌트로 전달되는 보조 입력이었다. 본 결정으로 그 메모 입력이 **직접 작성 일기**로 의미가 바뀐다 — 메모에 글이 있으면 그것이 일기가 되고 AI는 돌지 않는다.

UI 변경은 기존 메모 토글을 재활용하는 surgical 한 범위로 한정하고, 신규 DB 마이그레이션은 추가하지 않는다.

## Why

- PRD §5.3 의 AI 일기는 "도와주는" 장치이지 강제가 아니다. 사용자가 직접 쓰고 싶을 때 AI 결과가 본문을 덮어쓰면 의도와 어긋난다.
- 직접 입력 시 키워드를 강제하면(현 `selectedKeywords.min(1)` + 제출 버튼 disable) 불필요한 마찰이 생긴다 — 키워드는 AI 생성용 입력일 뿐이다.
- 직접 입력은 OpenAI 호출이 없으므로 비용·지연(4.5s 타임아웃 리스크)이 0 이다.
- 트레이드오프: 메모의 기존 "AI 힌트" 역할은 제거된다(아래 §Design C1 의 정밀 판정으로 이중 역할을 끊음). 직접 입력과 AI 생성은 상호 배타로 단순화된다.

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-05-28-action-manual-diary.md` (본 문서)
- 수정:
  - `src/lib/validators/action-log.ts` — 조건부 검증 (spec-required 경로)
  - `src/app/(app)/challenge/[id]/action/_actions.ts` — 직접 모드 분기
  - `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` — UI/제출 게이팅
  - `docs/BE_SCHEMA.md` §5.7 — `selected_keywords` 빈 배열 허용 주석 1줄
  - 테스트: `src/lib/validators/action-log.spec.ts`(또는 신규), 인증 플로우 integration spec

### src/ 영향

`src/app/(app)/challenge/[id]/action/**` · `src/lib/validators/action-log.ts`. `src/lib/ai/**` 는 **호출부만 조건부 분기**, 내부 변경 없음.

### Supabase / RLS / migration 영향

**없음 (마이그레이션 추가 안 함)**. `action_logs.selected_keywords` 의 CHECK `array_length(selected_keywords, 1) between 1 and 3` 는 빈 배열을 이미 통과시킨다 — Postgres 에서 빈 배열의 `array_length(...,1)` 는 `NULL` 을 반환하고, CHECK 제약은 식이 `TRUE` 또는 `NULL` 일 때 만족되기 때문(`FALSE` 일 때만 거부). RLS INSERT 정책(`al_insert_self_active`)은 키워드를 검증하지 않으므로 영향 없음.

### 외부 서비스

OpenAI — 직접 모드에서 **호출 안 함**(비용·토큰 0). AI 모드는 현행 유지.

## Design

### C1. 모드 판정 (client)

- **직접 모드** ⟺ `memoOpen && memo.trim().length > 0`. 그 외 = **AI 모드**.
- 정밀 판정으로 메모의 이중 역할(AI 힌트 ↔ 직접 일기)을 끊는다. **왜**: "글이 있으면 직접"이라는 단일 규칙이 사용자에게 가장 예측 가능.
- 직접 모드에서는 키워드 칩·reroll 버튼을 dim + disable 하고 "직접 작성 모드: AI·키워드를 건너뛰고 입력한 글이 그대로 저장돼요" 힌트를 보인다. **왜**: 고른 키워드가 조용히 버려지는 혼란 방지.
- 제출 버튼 enable: `!busy && (selected.length >= 1 || memo.trim().length > 0)`. 사진은 빈 상태 게이트(`!file && !preview`)가 이미 강제하므로 두 모드 모두 사진 필수.
- `memo` 는 직접 모드일 때만 FormData 로 전송(`memoOpen && memo`) — 토글을 닫으면 AI 모드로 간주.

### C2. 검증 (`src/lib/validators/action-log.ts`)

- `memo`: `max(100)` → `max(150)`. **왜**: 직접 일기는 `ai_summary`(`char_length <= 150`)에 저장되므로 AI 일기와 동일한 여백.
- `superRefine`: `memo` 가 없으면(undefined/빈 문자열) `selectedKeywords.length >= 1` 강제, `memo` 가 있으면 0 개 허용. `max(3)` · 풀 검증 · `shownKeywords.min(1)` 은 유지(키워드는 직접 모드에서도 화면에 노출되므로 `shownKeywords` 는 항상 채워짐).
- 필드명 `memo` 는 유지(surgical). 의미 변화는 주석으로 명시.

### C3. 서버 액션 (`_actions.ts`)

```ts
const isDirect = Boolean(parsed.input.memo); // memo 는 trim 후 비어있으면 undefined
const finalKeywords = isDirect ? [] : parsed.input.selectedKeywords;
```

- 직접: `generateDiary` 미호출. insert — `ai_summary = memo`, `template_fallback = false`, `prompt_version = "manual"`, `selected_keywords = []`, `memo = null`.
- AI: 현행 유지(`generateDiary` → `ai_summary`/`template_fallback`/`prompt_version`).
- `ai_generated` 이벤트는 직접 모드에서 **미발사**(AI 가 돌지 않았으므로). **왜**: latency/coverage/fallback 메트릭 오염 방지.
- `action_logged` 는 스키마 무변경. 직접 모드에서 `selectedKeywords=[]`, `keywordCount=0`, `hasMemo=true` 가 자연스러운 manual 마커가 됨.
- 분석 시 직접/AI 구분은 `action_logs.prompt_version = 'manual'` 로 가능.

### C4. 저장 위치

직접 일기 → `ai_summary`(피드가 표시하는 필드). `memo` 컬럼은 직접 모드에서 `null`. 부수 효과: 모든 메모 텍스트가 직접 모드를 의미하므로 `memo` 컬럼은 사실상 항상 `null` 이 되고, `hasMemo` 는 manual 여부의 proxy 가 된다.

## Alternatives Considered

- **명시적 세그먼트 토글(AI/직접)**: 모드가 가장 명확하지만 화면 레이아웃 변경 폭이 크다. POC surgical 원칙상 기존 메모 토글 재활용을 채택.
- **키워드 0 개 허용을 위한 명시 마이그레이션**(`coalesce(array_length(...),0) between 0 and 3`): 의도를 코드로 못박지만 단방향 migration + ADR 비용. 기존 CHECK 가 이미 빈 배열을 통과하므로 미채택. 대신 integration 테스트로 실측 검증.
- **`diarySource` prop 을 `action_logged` 에 추가**: 가장 명확하나 `track.ts` union + PRD §9.1 spec 갱신 필요. `prompt_version='manual'` + `keywordCount=0`/`hasMemo=true` 로 충분히 구분 가능해 미채택.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오

- 직접 모드: 메모에 글 입력 → 키워드 0 개로 제출 성공 → `ai_summary` = 입력 그대로, `template_fallback=false`, `prompt_version='manual'`, `selected_keywords=[]`, `ai_generated` 미트래킹, `generateDiary` 미호출.
- AI 모드: 메모 비움 + 키워드 0 개 → 제출 버튼 disabled / zod 거부. 키워드 1~3 개 → 현행 AI 생성.
- 경계: `memo` 150 자 통과, 151 자 거부. 직접 모드에서 키워드를 골라도 `selected_keywords=[]` 로 저장.
- DB 실측: `selected_keywords = '{}'` insert 성공(CHECK 통과).
- 모바일 viewport: 토글 열기 → 입력 시 키워드 dim, 제출 활성; 토글 비우면 키워드 다시 활성·제출 비활성.

## Rollout

본 spec 머지 후 단일 구현 PR(`feat/action-manual-diary`)이 따라온다. dogfood 중 "직접 입력 사용 비율"은 `prompt_version='manual'` 카운트로 관찰.

### 롤백

기능 단위 1 PR revert 로 원복(마이그레이션 없음 → DB 롤백 불필요).

## Out of scope

- 제출 후 일기 편집/재생성(AC-5/7, `regenerate_count`·`edited_at`)은 본 spec 범위 밖.
- AI 모드에 별도 "힌트 메모" 재도입은 다루지 않음(메모 = 직접 일기로 단일화).
- `memo` 컬럼 제거 마이그레이션은 다루지 않음(항상 null 이 되지만 POC 단방향 정책상 유지).

## 용어집

- **AI 모드**: 키워드를 골라 `generateDiary`(OpenAI)가 일기를 생성하는 기존 경로.
- **직접 모드**: 메모 textarea 에 글이 있어 AI 를 건너뛰고 입력 글을 그대로 저장하는 경로.
- **CHECK 제약**: Postgres 행 제약. 식이 `FALSE` 일 때만 거부하고 `NULL`/`TRUE` 면 통과.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어.
- **prompt_version**: `action_logs` 의 AI 프롬프트 버전 마커. 직접 모드는 `'manual'` 로 기록해 분석에서 구분.
