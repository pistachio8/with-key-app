---
spec: 2026-05-28-meal-time-prompt
title: Meal Time Prompt — 끼니 시간대 컨텍스트 주입
author: pistachio8
date: 2026-05-28
status: draft
---

## Summary

meal 활동에 한해, 업로드 시각(서버 epoch)을 KST(Korea Standard Time, 한국 표준시) 끼니(아침/점심/저녁/야식)로 추론해 AI 일기 프롬프트에 **soft context 한 줄**로 주입한다.

`PROMPT_VERSION` 을 v3 → v4 로 bump 한다. 4.5s 타임아웃 · 키워드 커버리지 `<1` 폴백 · 프롬프트/응답 본문 비로깅 가드레일은 그대로 유지하고, analytics(PRD §9.1) 와 DB 스키마는 변경하지 않는다.

## Why

- ADR-0015 로 meal 활동이 추가됐지만, 프롬프트 빌더는 활동 타입 라벨만 받아 **끼니 맥락이 없다** — 같은 샐러드라도 "점심"인지 "야식"인지 일기가 구분하지 못한다.
- 업로드 시각은 이미 서버가 가진 신호다. 이걸로 끼니를 추론하면 **추가 입력 UI 없이** 일기 자연스러움을 올릴 수 있다.
- Vercel 런타임은 UTC, 사용자는 KST다. 시각 변환을 틀리면 끼니가 통째로 어긋난다(정오 업로드가 "야식"으로). 고정 +9 offset 으로 결정적 변환이 필요하다.
- 끼니를 필수 키워드로 만들면 fallback 폭증 · 억지 문장 위험이 있다 → coverage 에 영향을 주지 않는 soft hint 로 한정한다.

## Impact Scope

### 변경 경로

- 신규: `src/lib/ai/meal-time.ts` · `src/lib/ai/meal-time.spec.ts`
- 수정: `src/lib/ai/prompts.ts`(PROMPT_VERSION v4 · `DiaryPromptInput.mealSlot` · `buildUserPrompt` soft 라인) · `src/lib/ai/diary.ts`(`templateFallback` meal 분기) · `src/app/(app)/challenge/[id]/action/_actions.ts`(경계 계산 · 전달) · `src/lib/ai/diary.spec.ts`(케이스 보강)

### src/ 영향

위 경로에 한정. meal 외 활동(running · gym · yoga · other) 생성 경로는 불변.

### Supabase / RLS / migration 영향

없음. `mealSlot` 은 DB 에 저장하지 않는다(soft context — 프롬프트에만 주입).

### 외부 서비스

OpenAI `gpt-4o-mini` — user 프롬프트에 1줄 추가(토큰 증가 미미). 4.5s 타임아웃 · 본문 비로깅 불변.

## Design

- **C1 `inferMealSlot(epochMs): MealSlot`** — 순수 함수. `(epochMs + 9h) / 1h % 24` 로 KST hour 를 산출하고 4버킷에 매핑한다. **왜 +9 고정**: KST 는 DST(Daylight Saving Time, 일광 절약 시간제)가 없어 offset 이 불변 — tz database · `Intl` 의존 없이 결정적으로 테스트할 수 있다.
- **경계**: 아침 05–10 / 점심 11–16 / 저녁 17–21 / 야식 22–04(자정 넘김). **왜 24시간 전체 커버**: 틈 없이 항상 끼니가 확정되고, soft hint 라 경계 근처 오분류도 일기 품질 영향이 작다.
- **C2 `buildUserPrompt`** — 호출부가 넣은 `mealSlot` 이 있을 때만 `식사 시간대: <끼니> (자연스러우면 일기에 녹이고, 억지로 넣지 말 것)` 한 줄을 추가한다. **왜 user 프롬프트만**: `SYSTEM_PROMPT` 변경은 비meal 생성에도 영향을 줘 회귀 표면이 커진다.
- **C3 coverage 불간섭** — 끼니는 `keywords` 배열이 아니므로 `keywordCoverage` 산식과 `<1 → templateFallback` 게이트가 그대로다. **왜**: 끼니를 강제 토큰으로 만들면 fallback 증가 · 억지 문장 위험.
- **C4 계산 위치 = 경계(Server Action)** — `submitActionLog` 이 이미 잡은 `now`(`Date.now()`)로 meal 일 때만 `inferMealSlot` 을 호출해 enum 을 `generateDiary` input 으로 전달한다. **왜**: clock/timezone 관심사를 boundary 에 두면 `diary.ts` · `prompts.ts` 가 clock-free 로 유지돼 결정적 테스트가 가능하다.
- **C5 `templateFallback` meal 분기** — 운동 프레이밍("몸에 힘이 붙은") 대신 식사 톤(`오늘 <끼니>으로 <키워드> 챙겨 먹었어요. 🥗`). **왜**: AI 실패(타임아웃 · coverage `<1` · 키 부재) 시에도 끼니 일관성을 유지한다.

## Alternatives Considered

- **클라이언트 로컬 시각 전송**: 해외 체류까지 정확하지만 validator · 신뢰경계 추가 · spoofing · 클라이언트 시계 오류 리스크. POC 는 한국 dogfood 라 서버 +9 가 더 단순 · 안전.
- **끼니를 필수 키워드(coverage 포함)**: 시간대 반영이 강제되지만 fallback 폭증 · 억지 문장 → 기각.
- **analytics 에 `mealSlot` 추가**: 끼니별 분석이 가능하나 PRD §9.1 과 1:1 · PO 승인이 필요. `prompt_version=v4` 로 사후 세그먼트가 가능하므로 보류.
- **전 활동 타입 적용**: 적용 범위 · 회귀 위험이 커지고, 끼니 어휘는 운동 일기에 어색 → meal 한정.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오

- 경계값: KST 04:59→야식 / 05:00→아침 / 10:59→아침 / 11:00→점심 / 16:59→점심 / 17:00→저녁 / 21:59→저녁 / 22:00→야식 / 00:00→야식.
- UTC→KST 변환: UTC 02:00 instant → 점심.
- meal + slot: user 프롬프트에 `식사 시간대: 점심` 포함, coverage=1 이면 `fallback=false`.
- 비meal: 슬롯 라인 없음.
- coverage 불간섭: AI 가 키워드를 누락하면 끼니가 있어도 fallback.
- template meal 분기: 식사 톤 + 끼니 + 키워드 포함, "몸에 힘이 붙은" 미포함.

## Rollout

1. 본 spec 머지 → 구현 PR(`feat/ai-meal-time-prompt`, base `develop`).
2. Vercel Preview 에서 meal 인증 1건을 생성해 일기 문구를 확인한다(끼니 자연 반영 여부).
3. dogfood 중 meal 일기 샘플을 관찰하고, 끼니 오분류 · 억지 삽입이 보고되면 경계 · 문구를 조정한다.

### 롤백

구현 PR 1건 revert. `PROMPT_VERSION` 은 코드 상수라 v3 로 자동 복귀. DB · analytics 변경이 없어 데이터 마이그레이션이 불필요하다.

## Out of scope

- `운동 종류: meal` · `SYSTEM_PROMPT` 의 "운동 일기" 프레이밍 정리(ADR-0015 잔여 — 별도 작업).
- 끼니별 analytics · 대시보드.
- 사용자 수동 끼니 선택 UI.
- 간식 등 5번째 버킷.

## 용어집

- **coverage(keyword coverage)**: AI 응답에 선택 키워드가 포함된 비율. `<1` 이면 템플릿 폴백.
- **끼니(meal slot)**: 아침 · 점심 · 저녁 · 야식 중 하나. 업로드 KST hour 로 추론.
- **DST(Daylight Saving Time)**: 일광 절약 시간제. KST 는 미적용이라 +9 고정이 안전.
- **KST(Korea Standard Time)**: 한국 표준시, UTC+9.
- **PROMPT_VERSION**: AI 프롬프트 버전 상수. 변경 시 bump + spec 작성.
- **RLS(Row Level Security)**: Postgres 행 단위 접근 제어.
- **soft context**: 강제가 아닌 참고용 프롬프트 힌트. 본 기능의 끼니 주입 방식.
