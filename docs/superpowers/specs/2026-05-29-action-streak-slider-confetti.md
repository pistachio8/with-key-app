---
spec: 2026-05-29-action-streak-slider-confetti
title: 인증 완료 DaySlider — 과거 인증일 streak 채도 + 챌린지 성공 컨페티
author: pistachio8
date: 2026-05-29
status: draft
---

## Summary

인증 완료 모달(`action-result-dialog.tsx`의 `CompletedBody`)에 들어가는 `DaySlider`를 개선한다. 지금은 오늘 칸 하나만 강조하지만, 앞으로는 **내가 인증했던 모든 과거 날짜를 컬러로 표시**하고, **연속 인증(streak)이 길수록 그 날 칸을 더 진하게** 칠한다(running ramp, 고정 7단계).

여기에 더해, 오늘 인증이 **챌린지 성공 조건(누적 인증일수 = `goalCount`)에 처음 도달한 순간**이면 전용 성공 모달(`goal-reached` variant)과 **컨페티 연출**(상단에서 흩날려 떨어짐)을 보여준다. 슬라이더가 오늘로 슬라이드되어 **도착하는 순간** 컨페티가 발화한다.

본 spec이 머지된 뒤 구현 PR이 따라온다. DB·RLS·migration 변경은 없고, 기존 `action_logs` 읽기만 추가하며, 신규 의존성으로 `canvas-confetti`(동적 import)를 도입한다.

## Why

- **동기/리텐션:** 현재 DaySlider는 "오늘 며칠째"만 보여준다. 과거 인증 흔적과 streak 농도를 보여주면 "쌓아온 것"이 한눈에 보여 이어가려는 동기가 강해진다.
- **성공의 정점 부재:** 챌린지 성공(`doneCount >= goalCount`)은 정산/리캡(`settlement.ts`·`recap.ts`)에만 반영되고, 달성 순간 사용자에게 보상 피드백이 없다. 컨페티로 그 순간을 마킹한다.
- **사용자 요청 직역과 제품 규칙의 정합:** "여러 번 한 날 진하게"는 1일 1회 카운트(`done-days.ts` SoT)와 충돌할 수 있어, **streak(연속 인증)** 으로 재해석해 충돌을 피했다.
- **일자 인덱싱 정합성:** 기존 `currentDay`는 raw ms 버킷이라 KST 캘린더 일자(인증 카운트 SoT)와 자정 경계에서 어긋날 수 있다. 칸 인덱스와 인증일을 정확히 맞추려면 KST 캘린더 일차로 통일해야 한다(부수적 정정).

## Impact Scope

### 변경 경로

- 신규:
  - `src/lib/challenge/streak-tiers.ts` (+ `streak-tiers.spec.ts`) — streak → tier 순수 함수
  - `src/app/(app)/challenge/[id]/action/_components/confetti-burst.tsx` — 컨페티 클라이언트 컴포넌트(`canvas-confetti` 동적 import + reduced-motion 가드)
- 수정:
  - `src/lib/challenge/done-days.ts` — KST 캘린더 일차 helper(`kstDayDiff` / `dayIndexOf`) 추가
  - `src/app/(app)/challenge/[id]/action/_actions.ts` — `verifiedDays` · `goalReached` 반환, KST 일차로 `currentDay` 산출
  - `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` — `goal-reached` variant 추가, props 전달, variant 우선순위
  - `src/app/(app)/challenge/[id]/action/_components/day-slider.tsx` — tier 렌더 + aria-label + 가변 duration + 도착 콜백
  - `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` — `verifiedDays`·`goalReached`를 dialog state로 전달
  - `src/app/globals.css` — `--streak-1` … `--streak-7` 토큰 7개

### src/ 영향

위 경로 한정. `DaySlider` 사용처는 인증 완료 모달 1곳뿐이라(blast radius 확인) 다른 화면 영향 없음. `first-success`·`failed` variant 본문은 변경하지 않는다(우선순위 분기만 추가).

### Supabase / RLS / migration 영향

없음. `action_logs`의 본인 행 SELECT만 추가하며 기존 RLS(`users_select_self`/그룹 멤버 select)가 이미 허용. 스키마·정책 변경 없음.

### 외부 서비스

없음(OpenAI·Web Push 무관). 신규 npm 의존성 `canvas-confetti`(MIT, ~6KB gz)만 추가.

## Design

### 데이터 모델 / 정의

- **인증 카운트 SoT:** `done-days.ts` — 인증 = KST(Asia/Seoul) 자정 기준 distinct 캘린더 일자. 같은 날 N개 로그는 1로 카운트.
- **성공(achieved) SoT:** `settlement.ts` — `doneCount >= goalCount`. `goalCount`는 1~7(주 N회 빈도지만 POC 정산은 전체 기간 distinct 일수와 비교하는 flat 기준). `recap.ts`의 `achieved`와 동일 정의 재사용.
- **challenge 일차 인덱스:** `dayIndexOf(kstDayKey)` = 시작일(KST 캘린더 일자)로부터의 캘린더 일수 차 + 1. 한국은 DST 없음 → `YYYY-MM-DD` 파싱 후 일수 차로 안전.

### C1. streak → tier 순수 함수 (`streak-tiers.ts`)

```ts
// src/lib/challenge/streak-tiers.ts
// 입력: 인증한 challenge 일차 인덱스(1..totalDays), 전체 일수
// 출력: Map<일차, tier(0..7)>  (0 = 미인증)
export function streakTiers(
  verifiedDays: ReadonlyArray<number>,
  totalDays: number,
): Map<number, number> {
  const set = new Set(verifiedDays);
  const out = new Map<number, number>();
  let run = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (set.has(d)) {
      run += 1;
      out.set(d, Math.min(run, 7)); // 7일+ 평탄화
    } else {
      run = 0;
      out.set(d, 0);
    }
  }
  return out;
}
```

**왜 순수 함수 분리:** 경계(빈 목록·전부 연속·중간 끊김·7일 초과)를 단위 테스트로 고정하고, `DaySlider`는 렌더만 담당(`done-days.ts` 옆 colocate).

### C2. KST 일차 helper (`done-days.ts`에 추가)

```ts
// 두 KST 캘린더 일자(YYYY-MM-DD) 사이 일수 차
export function kstDayDiff(fromKey: string, toKey: string): number {
  /* UTC midnight diff / 86400000 */
}
// 시작일 기준 1-indexed 일차
export function dayIndexOf(kstDayKey: string, startKstDayKey: string): number {
  return kstDayDiff(startKstDayKey, kstDayKey) + 1;
}
```

### C3. Server Action (`_actions.ts`)

`submitActionLog`에서 insert **성공 후** 다음을 산출해 `SubmitResult`에 추가한다.

- `membership.challenges` select 에 `goal_count` 추가.
- 본인+challenge의 `action_logs.created_at` 전체 조회(인덱스 `idx_action_logs_challenge_user_created`, 제출 시 1회) → 각 `created_at`을 `toKstDayKey` → distinct → `dayIndexOf(_, startKstDayKey)` → `1..totalDays`로 clamp/filter → **`verifiedDays: number[]`(정렬)**.
- `startKstDayKey = toKstDayKey(start_at)`; `currentDay = clamp(1, totalDays, dayIndexOf(toKstDayKey(now), startKstDayKey))`. (기존 raw ms 버킷 대체 — §Why 정합성)
- 달성 판정:
  - `doneCountAfter = verifiedDays.length`
  - `todayWasNewDay` = 오늘 KST 일자 로그가 이번 insert 1건뿐인지(>1이면 false)
  - `doneCountBefore = doneCountAfter - (todayWasNewDay ? 1 : 0)`
  - `goalReached = doneCountBefore < goalCount && doneCountAfter >= goalCount` (= 정확히 도달하는 제출에서만 true)

반환 추가 필드: `verifiedDays: number[]`, `goalReached: boolean`, `goalCount: number`.

### C4. 결과 모달 (`action-result-dialog.tsx`)

- 신규 variant `"goal-reached"`. **우선순위: `goal-reached` > `first-success` > `completed`.** (goalCount=1이면 첫 인증이 곧 달성 → 더 큰 순간인 goal-reached 우선) **왜:** 한 제출이 여러 조건을 만족할 때 가장 의미 큰 연출을 노출.
- `goal-reached` 본문: 🎉 배지 + "챌린지 성공!" + "목표 N회를 모두 채웠어요" + `DaySlider`(달성 streak) + `<ConfettiBurst/>`.
- `completed` 본문은 기존대로 `DaySlider`만(컨페티 없음). `verifiedDays`는 두 variant 모두에 전달.

### C5. DaySlider (`day-slider.tsx`)

- props에 `verifiedDays: number[]` 추가. `streakTiers(verifiedDays, totalDays)`로 tier 산출 후 칸별 렌더:
  - tier ≥ 1 → `--streak-{tier}` 배경. **글자색**: tier 5~7 흰색, 1~4 `--foreground`(기존 활성 칩 white-on-primary 규칙과 일치).
  - tier 0 & `d < currentDay` → 미인증: `--muted` 배경(채워진 원).
  - tier 0 & `d > currentDay` → 미래: 투명 + 점선 border.
  - `d === currentDay` → 위 색 + **금색 링**(`--secondary` box-shadow).
- **슬라이드 duration(가변):** `clamp(1600, round(2000 * (currentDay/8)^0.4), 3200)` ms, easing `--ease-out-soft`. 기존 고정 3000ms 대체. **왜:** 오늘이 멀수록(거리 ↑) 시간은 천천히 늘려(속도 ↑) 휙 지나가되 3.2초 상한으로 과하지 않게. 8일차 ≈ 2.0s 앵커.
- **접근성:** 칸마다 `aria-label`("3일차, 인증함" / "4일차, 미인증" / "8일차, 오늘 인증함"). **왜:** 색만으로 의미 전달 금지(WCAG 1.4.1), 색맹/SR 대응.
- **reduced-motion:** 기존처럼 슬라이드 생략(즉시 정적). 도착 콜백은 즉시 호출.
- **도착 콜백:** transitionend(transform) 시 `onArrive()` 1회 호출(reduced-motion이면 mount 직후). goal-reached에서 컨페티 발화 트리거.

### C6. ConfettiBurst (`confetti-burst.tsx`)

- `goal-reached`에서만 마운트. `DaySlider`의 `onArrive`(도착) 시 발화.
- `canvas-confetti`를 **동적 import**(`await import('canvas-confetti')`) — base 번들 무영향(web/performance "heavy libs 동적 import").
- 연출: **상단에서 흩날려 떨어짐**(snow 스타일, 상단 emit + gravity), 브랜드 5색(`#8AA4FF`·`#FFD46B`·`#BCA6FF`·`#FFB6C6`·`#52C28C`).
- **reduced-motion**: 발화 생략(성공 모달 정적 표시). **왜:** 전정 장애/모션 민감 사용자 보호.

### C7. 디자인 토큰 (`globals.css`)

7단계 streak 램프(hue 270.7, `--primary` 계열 보간). 미리보기에서 확정한 값:

```css
--streak-1: oklch(0.93 0.045 270.7);
--streak-2: oklch(0.885 0.067 270.7);
--streak-3: oklch(0.84 0.088 270.7);
--streak-4: oklch(0.79 0.108 270.7);
--streak-5: oklch(0.74 0.125 270.7);
--streak-6: oklch(0.685 0.138 270.7);
--streak-7: oklch(0.62 0.15 270.7);
```

### Data flow

```text
제출 → submitActionLog (insert 후)
  ├─ action_logs.created_at 조회 → KST distinct → dayIndexOf → verifiedDays[]
  ├─ doneCount(before/after) → goalReached
  └─ SubmitResult { currentDay, totalDays, verifiedDays, goalReached, goalCount, isFirstAction, … }
       ↓ (ActionForm state)
   ActionResultDialog (variant 우선순위: goal-reached > first-success > completed)
       ↓
   DaySlider  ── streakTiers() 칸 렌더, currentDay 로 슬라이드(가변 duration)
       └─ onArrive() ─→ (goal-reached) ConfettiBurst.fire()
```

## Alternatives Considered

- **streak 채도 매핑 — uniform block vs running ramp:** 연속 구간을 길이별 단색으로 칠하는 방식(잔디 덩어리)도 검토했으나, "오늘 칸이 현재 streak의 가장 깊은 색"이 되는 **running ramp**가 달성 순간의 보상감과 더 맞아 채택.
- **단계 증가 — 고정 7단계 vs 챌린지 길이 비례:** 길이 비례(끝까지 가야 최고 농도)는 긴 챌린지에서 보상이 늦어 **고정 7단계**(7일이면 최고 단계) 채택.
- **컨페티 — canvas-confetti vs 직접 구현 CSS/canvas:** 직접 구현은 코드/품질 부담이 커서, 검증된 `canvas-confetti`(동적 import) 채택. 미리보기의 자체 구현은 시각 확인용일 뿐 최종은 라이브러리.
- **컨페티 방향 — 바닥 캐넌 vs 상단 낙하:** 바닥 좌·우/모달 하단 분출도 시도했으나, 모달 맥락에선 **상단에서 떨어지는** 연출이 자연스러워 채택.
- **달성 기준 — achieved 도달 vs 기간 완주 vs 주차별:** 코드 SoT인 `doneCount >= goalCount` **도달 순간** 채택(단순·일관). 기간 완주/주차 집계는 신규 로직이라 범위 외.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

신규/변경 테스트:

- `streak-tiers.spec.ts` — 빈 목록 / 전부 연속 / 중간 끊김 / 7일 초과 / 단일 일자.
- `done-days.spec.ts` — `kstDayDiff` · `dayIndexOf` 경계(월 경계·시작일 당일·동일 일자).
- `_actions.spec.ts` — `verifiedDays` 산출, `goalReached` 크로싱(미달→도달 시 true, 이미 달성/반복 제출 시 false), `currentDay` KST 일차.

### 시나리오 (모바일 viewport 수동)

- 정상: 며칠 인증 후 완료 모달 → 과거 칸 채도, 오늘 금색 링, 오늘로 슬라이드.
- 달성: 누적 인증일수가 `goalCount`에 도달하는 제출 → goal-reached 모달 + 슬라이드 도착 시 컨페티.
- 비달성/반복: 이미 달성 후 재인증 → completed 모달(컨페티 없음). 같은 날 2번째 제출 → goalReached false.
- 엣지: goalCount=1 첫 인증 → goal-reached 우선. 80일차 같은 먼 일차 → 슬라이드 속도 상한(3.2초). reduced-motion → 슬라이드/컨페티 생략, 성공 상태 정적.

## Rollout

- 단일 PR로 구현(스키마 변경 없음). Vercel Preview에서 인증 완료 플로우 smoke 후 머지.
- Week 2 dogfood에서 컨페티 빈도/세기·슬라이드 속도 곡선(^0.4·상한 3.2s) 체감 피드백 수집 후 토큰만 조정.

### 롤백

기능 추가형 변경이라 구현 PR 1건 revert로 원복. `canvas-confetti` 의존성 제거 포함. DB 마이그레이션이 없어 데이터 롤백 불필요.

## Out of scope

- 대시보드/리캡 등 다른 화면의 streak 시각화(완료 모달 한정).
- 주차별 목표 달성 집계, 기간 완주 기반 성공 판정.
- `first-success`·`failed` variant 본문 리디자인.
- 그룹 전체/타인 인증일 표시(본인 기록만).

## 용어집

- **streak**: 연속 인증 — 끊김 없이 이어진 KST 캘린더 인증일의 연속 길이.
- **tier**: streak 농도 단계(0=미인증, 1~7). 7일+는 7로 평탄화.
- **achieved / 달성**: `doneCount >= goalCount`. 누적 distinct 인증일수가 목표 횟수 이상.
- **goalReached**: 그 제출에서 처음 achieved로 넘어가는 크로싱(컨페티 트리거).
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어.
- **reduced-motion**: `prefers-reduced-motion` — 모션 최소화 선호 설정.
