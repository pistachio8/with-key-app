---
spec: 2026-06-02-weekly-penalty-accrual
title: 주 단위 벌금 누적 모델 재정의 + 현황판 표현(H3)
author: Ian
date: 2026-06-02
status: draft
---

## Summary

챌린지 벌금을 **주 단위 누적 모델**로 재정의한다. 현재 `src/lib/challenge/settlement.ts`는 "챌린지 전체 기간에 대해 1회" 평가(`doneCount >= goalCount`)인데, `goalCount`는 의미상 **주 N회(주간 빈도, 1~7)**라서 기간이 7~90일로 늘어나면 정의가 깨진다(예: 90일 챌린지에서 전체 3일만 인증해도 "성공·0원"). 이 spec은 (1) 주(week) 단위로 목표를 평가·누적하고, (2) 7일 미만 자투리 주는 목표를 일수 비례(올림)로 환산하며, (3) 화면에는 "이미 확정된 벌금(단조 증가)"과 "현재 주의 위험(회복 가능)"을 분리해 보여주는 표현(현황판 H3 시안)을 정의한다.

본 spec이 머지된 뒤 구현 PR이 따라온다. POC 단계에서 벌금은 여전히 **표시만**이며 실제 정산/이체는 v1 이후다(PRD §1.2 · §11.2).

## Why

- **측정 단위 모순**: `goalCount`는 "주 N회"(`src/lib/challenge/frequency.ts`, `docs/BE_SCHEMA.md:256` "주 단위")인데 `computePerHeadPenalty`는 전체 기간 누적 `doneCount`와 비교한다. `docs/BE_SCHEMA.md`도 v0.2 changelog(§12)에서 "D-006 × goal_count 측정 단위 모순"을 이미 플래그했고, §11 follow-up의 `progress.ts`(주 단위 평가)는 **미구현** 상태다.
- **현황판 placeholder 버그**: `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx:30-31`이 `totalFailures = 0` placeholder라 현황판 "누적 벌금"이 **항상 0원**으로 표시된다. 같은 챌린지인데 정보탭(`computeAccruedPot`)과 값이 다르다.
- **개념 모호**: "예정 벌금"(홈 stat) · "모인 예정 벌금"(정보탭) · "누적 벌금"(현황판) 세 라벨이 혼재하고, "이미 낸 것"과 "아직 막을 수 있는 것"이 한 숫자에 섞여 사용자가 헷갈린다.
- **동기 정렬**: 주 단위 누적은 "이번 주만 잘하면 된다"는 짧은 호흡의 목표를 만들어 장기 챌린지의 포기율을 낮춘다.

## Impact Scope

### 변경 경로

- 신규:
  - `src/lib/challenge/weekly.ts` — 주차 인덱싱 · 주차별 목표(자투리 ceil) · 주차별 done 집계 · 주 단위 per-head/누적 벌금 · 현재 주 상태 계산
  - `src/app/(app)/challenge/[id]/_components/week-chips.tsx` — 주차별 기록 칩(H3 주인공)
  - `src/app/(app)/challenge/[id]/_components/week-ring.tsx` — 이번 주 진척 링(작은 게이지)
- 수정:
  - `src/lib/challenge/settlement.ts` — `computePerHeadPenalty`/`computeAccruedPot`를 주 단위로 재정의(또는 `weekly.ts`로 위임). `pickMvpIds` 정의 보정(아래 §Design)
  - `src/lib/db/reads/challenge-detail.ts` · `src/lib/db/reads/current-challenges.ts` — 주차 분할 집계로 `potTotal`(=확정 누적) 산출, 현재 주 상태 필드 추가
  - `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` — placeholder 제거, `detail`에서 확정 누적·주차 기록·현재 주 상태 전달
  - `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx` — H3 레이아웃(주차 칩 + 작은 링 + 누적 금액)
  - `src/app/(app)/home/page.tsx` — `totalPenalty`(내 확정 벌금)를 주 단위 per-head로 산정
  - `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` · `recap.ts` — 주차별 결과 + 최종 per-head 반영(cutoff = `closed_at`)
  - 종료 경로 — 수동 close `_actions.ts` · auto-close cron(`src/app/api/cron/**`)이 `challenges.closed_at = now()` set
  - 신규 migration `supabase/migrations/000X_challenge_closed_at.sql` + ADR(조기 종료 정산 cutoff)

### src/ 영향

위 경로. 코어 로직(`lib/challenge`), 두 read 함수, 현황판/홈/정산 화면.

### Supabase / RLS / migration 영향

**migration 1개**: `challenges.closed_at timestamptz null` 추가(조기 종료 정산 cutoff 산정용). 주차 done 집계는 기존 `action_logs(challenge_id, user_id, created_at)`를 **조회 시점에 분할**한다(현재 `countDoneDaysByUser`와 동일, 무변경). `closed_at` 은 종료 경로(수동 close `_actions.ts` · auto-close cron)가 `now()` 로 1회 set, RLS 변경 없음(기존 challenges UPDATE 정책 내). `penalty_amount`/`goal_count`/`duration_days` 제약 그대로. **spec-required(`supabase/migrations/**`) → ADR 동반\*\*.

### 외부 서비스

**없음.**

## Design

용어: **주차(week)** = 챌린지 시작일을 1일차로 한 7일 묶음(달력 월요일 아님). **주차 목표(weekGoal)** = 그 주에 채워야 할 인증 횟수. **확정 벌금** = 이미 끝난 주의 미달 합(단조 증가). **현재 주 위험** = 진행 중인 주가 지금 이대로 끝나면 물게 될 잠정 금액(회복 가능).

### C0. 확정 산정 규칙 (사용자 결정 2026-06-02)

계산에 영향 주는 4개 선택지를 명시 확정한다(이전 암묵 가정 → 결정).

- **주 미달 = 전액(all-or-nothing)**: 그 주 `doneInWeek < weekGoal` 이면 done 수와 무관하게 `penaltyAmount` 전액. 부족분 비례·항목별 단가 없음. **왜**: 1,000원 단위 보존 + H3 칩(미달=+penaltyAmount)·PRD §11.2 일치.
- **자투리 주도 전액**: 7일 미만 자투리 주 미달도 `penaltyAmount` 전액(목표만 ceil 비례, 벌금은 비례 안 함). **왜**: 단순·단위 보존, 자투리는 짧고 드묾.
- **홈 "예정 벌금" stat = 내 확정 벌금만**(단조). 인증해도 즉시 0으로 안 떨어진다 — 현재 주 위험은 현황판 링이 담당. 2026-05-28 홈 거동("인증 시 0으로")을 본 모델이 대체. **왜**: 신뢰 가능한 단일 숫자.
- **MVP = 끝난 모든 주 목표를 빠짐없이 달성한 멤버 중 총 인증일 최다**(동률 공동). **왜**: 주 단위 "약속 완수" 의미와 정합.
- **조기 종료 = 잔여·중도 주 미부과**(사용자 결정): 오너가 end_at 전에 수동 종료하면 종료일까지 **완전히 끝난 주**만 확정하고, 미발생 주(15~28일 등)와 종료 시점에 잘린 부분 주는 charge 안 함. **왜**: 중도 종료가 안 한 미래 주 벌금을 소급 생성하는 모순 차단. 구현: `challenges.closed_at` 저장(아래 Impact·migration).

추가 전제:

- **평가 창 = 챌린지 `start_at` 단일 기준**: `active` 코호트는 활성화 시점에 고정(ADR-0009)이라 미서명자는 현재 챌린지 참가자가 아니다 → 모든 참가자가 같은 `start_at` 을 공유, per-member 주차 오프셋 없음.
- **시간 의존**: `confirmedPenalty`·`currentWeekStatus` 는 "오늘"에 의존(주 경계에서 값이 바뀜)하므로 `now` 를 RSC render 시점에 1회 계산해 인자로 내려보낸다(`feed-time.ts` 패턴). 장기 cache 에 baking 금지 — staleness 방지.

### C1. 주차 인덱싱 · 목표 (`weekly.ts`)

KST 일자 키(`toKstDayKey`, 기존 `done-days.ts`)를 재사용한다.

```ts
// src/lib/challenge/weekly.ts
// dayIndex 1-based (시작일=1). week 1-based.
weekIndexOf(dayKey, startKey) = Math.floor((dayIndex - 1) / 7) + 1
totalWeeks(durationDays)      = Math.ceil(durationDays / 7)
// 마지막 자투리 주만 일수 비례(올림), 그 외 full week 는 goalCount 그대로.
weekGoal(week, totalWeeks, goalCount, durationDays):
  if (week < totalWeeks || durationDays % 7 === 0) return goalCount
  remDays = durationDays - (totalWeeks - 1) * 7      // 1..6
  return Math.ceil(goalCount * remDays / 7)          // 예: goal 3, 자투리 3일 → ceil(1.28)=2
```

**왜 올림**: 자투리 일수에 비례하되, 사용자에게 유리한 내림보다 약속 이행을 살짝 더 요구하는 올림이 "비례" 의도에 맞고 8~13일 같은 큰 자투리에서 누수를 막는다.

### C2. 주차별 done 집계 (`weekly.ts`)

```ts
countDoneDaysByUserByWeek(logs, startKey, durationDays): Map<userId, Map<week, number>>
// 하루 N개 인증도 1회(KST distinct day) — 기존 done-days 규칙 유지 후 week 버킷에 분배.
// 가드: dayIndex 가 [1, durationDays] 밖인 stray 로그(시작 전·종료 후)는 버킷에 넣지 않는다.
```

### C3. per-head 벌금 · 확정/위험 분리 (`weekly.ts`)

```ts
// 한 주가 끝나는 일차 — 자투리(마지막) 주는 durationDays 로 클램프. **week*7 직접 사용 금지**.
weekEndDayIndex(week, durationDays) = min(week * 7, durationDays)

// 정산 기준 마지막 일차 = "챌린지가 실제 진행된 마지막 날". 조기 종료의 미발생 주를 막는 핵심.
//  · running: todayDayIndex - 1  → 완료된 날만; 현재 주(weekEnd >= today)는 제외.
//  · over(만기·status active): durationDays → 예정 전 주가 실제 진행됨.
//  · closed: min(durationDays, dayIndexOf(closed_at))
//      - 자연 종료(auto-close, closed_at >= end_at): durationDays → 전 주 정산.
//      - 조기 종료(closed_at < end_at): 종료일까지만 → 잔여·중도 주 미부과(사용자 결정).
//      - closed_at IS NULL(레거시/미설정) 폴백: durationDays.
cutoffDayIndex(ctx) = switch (ctx.phase) {
  running: ctx.todayDayIndex - 1
  over:    ctx.durationDays
  closed:  ctx.closedAt ? min(ctx.durationDays, dayIndexOf(toKstDayKey(ctx.closedAt), startKey))
                        : ctx.durationDays
}

// 그 주가 "끝까지 진행됐는가" — cutoff 안에 완전히 들어온 주만 정산(부분 잘린 주 제외).
isWeekElapsed(week, ctx) = weekEndDayIndex(week, ctx.durationDays) <= cutoffDayIndex(ctx)

// 끝난 주만 합산 → 단조 증가(현재 주·미진행 주 미포함이라 변동 없음).
confirmedPenalty(member, ctx) =
  Σ_{week=1..totalWeeks where isWeekElapsed(week, ctx)}  (doneInWeek < weekGoal ? penaltyAmount : 0)

// 현재 주 상태 — phase === 'running' 일 때만. over|closed 면 null(링·위험 미표시).
currentWeekStatus(member, ctx) = ctx.phase !== 'running' ? null : {
  week = weekIndexOf(todayKey, startKey),                       // running 이면 항상 1..totalWeeks
  goal = weekGoal(week, totalWeeks, goalCount, durationDays),   // 현재 주가 자투리면 prorated
  done,
  daysLeftInWeek = weekEndDayIndex(week, durationDays) - todayDayIndex + 1,  // 오늘 포함, 클램프 적용
  shortfall = max(0, goal - done),
  atRiskAmount = (penaltyAmount > 0 && done < goal) ? penaltyAmount : 0,     // 0원 챌린지는 위험 미표시
  // "마감 임박" = 무여유: 남은 가능일 <= 부족분 (이제 하루도 빠지면 안 됨)
  imminent = penaltyAmount > 0 && shortfall > 0 && daysLeftInWeek <= shortfall,
}
```

> running 의 `cutoff = today-1` 은 기존 `today > weekEnd` 와 동치(완전히 끝난 주만)이고, over 는 durationDays 로 동일하다 — **조기 closed 만 바로잡힌다**(closed_at 기준으로 미발생/중도 주 제외). closed/over 는 today 비의존이라 deterministic·cache 가능, running 만 today 의존.

- **확정 누적(`potTotal`/홈 `totalPenalty`/현황판 "지금까지 모인 벌금")** = 끝난 주 기준 per-head 합. 단조 증가, 절대 줄지 않는다. **왜**: 신뢰 가능한 숫자.
- **현재 주 위험**은 합계에 더하지 않고 링 진척으로 암시하다가, `imminent`(무여유)일 때만 `atRiskAmount`를 "이대로면 +N원"으로 명시한다(사용자 결정: 평소 암시·마감임박 명시).
- **불변식**: (i) `confirmedPenalty`는 끝난 주만 보므로 인증을 더 해도 안 줄고 주 경계에서만 증가(단조). (ii) recap·현황판·홈이 **같은 `cutoffDayIndex`** 를 쓰므로 `confirmedPenalty == computeAccruedPot 의 내 몫 == recap 최종 per-head`(이중 SoT 방지) — 조기 종료 시에도 셋이 동일(모두 `closed_at` cutoff). (iii) 현재 주 `atRiskAmount` 는 어떤 합계(`confirmedPenalty`·`computeAccruedPot`)에도 더하지 않아 이중계상 없음. (iv) 마지막 주에서는 `daysLeftInWeek == remainingDays(end_at)` 이므로 헤더 D-day 와 링 "이번 주 남음" 이 같은 값(중복 인지 방지 위해 라벨 구분 필요). (v) 조기 종료는 미발생 주(weekEnd > cutoff)를 charge 하지 않고, 종료된 부분 주(중도 잘림)도 제외 — "잔여 주 미부과".

### C4. 그룹 누적 (`computeAccruedPot` 재정의)

```ts
computeAccruedPot = Σ_{member} confirmedPenalty(member)   // 끝난 주만, 미시작(pending/accepted)=0
```

가드: `status` 가 `active`(over 포함 — over 는 status='active' + end_at 경과) 또는 `closed` 일 때만 합산, `pending`/`accepted` → 0(start_at null 이라 주차 인덱싱 불가하기도 함). 각 멤버 `confirmedPenalty` 는 동일 `ctx`(같은 `cutoffDayIndex`)를 쓰므로 **자연 종료 시 전 주, 조기 종료 시 종료일까지의 주**가 일관 반영되어 recap 최종 합계와 일치한다.

### C5. MVP 보정 (`pickMvpIds`)

현재 "전체 doneCount ≥ goalCount 중 최다"는 주 단위와 안 맞는다. → **끝난 모든 주의 목표를 한 번도 빠짐없이 달성한 멤버** 중, 총 인증일이 최다인 멤버로 재정의(동률 공동 MVP). POC 표시용이라 단순 유지.

### C6. 현황판 H3 표현

실제 페이지 구조 유지: 상단 `StatusCard`(운영자·**D-day 우상단**·`주N회 · N일 · 벌금` 메타·소셜) → 둥근 `TabNav` → 현황판 콘텐츠. **D-day·기간은 헤더에 통합**(별도 칩 금지).

현황판 콘텐츠(H3):

- **주차 기록 칩**(주인공): 주차별 `N/목표` 칩 — 달성(primary-soft) · 미달(warn 틴트) · 현재 주(점선) · 미래 주(중립). 어느 주가 벌금을 만들었는지 투명.
- **누적 금액 행**: "지금까지 모인 벌금 N원"(확정, 단조).
- **작은 링**(이번 주): `done/goal` 게이지 + "3번 채우면 추가 벌금 0원"(긍정 프레이밍). `imminent`이면 "이대로면 +N원" 추가.
- 톤: 친근·이모지 없음. 색·컴포넌트는 `2026-05-14-ui-revision-v3.html` 가이드 토큰 사용.

## Alternatives Considered

- **전체 1회 평가(현행 유지)** — 변경 최소지만 장기 챌린지에서 goalCount "주 N회"가 무의미. 기각.
- **전체 1회 + 기간 비례 목표(B′)** — `round(goalCount × 기간/7)`로 환산해 단발 평가. 단순하나 벌금이 기간에 안 커져 장기 약속의 무게가 약함. 기각(사용자: 기간 비례 누적 선호).
- **일(day) 단위 벌금** — goalCount(빈도) 개념과 충돌, UI/PRD 전면 재작성. 기각.
- **자투리 주: 무시 / 풀주 취급** — 무시는 8~13일 큰 누수, 풀주는 가혹(3일에 주7회 불가). ceil 비례 채택.
- **현재 주 위험 트리거: 즉시 예측 / 페이스 / 회복불가 단독** — 즉시는 변동성·과장, 회복불가는 너무 늦음. "평소 암시 + 무여유 시 금액 명시" 절충 채택.
- **현황판 표현 A1~G3** — Visual Companion으로 24개 시안 비교 후 H3(주차 칩 + 작은 링) 채택. 가시성·친근함·바형 히스토리 균형.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오 (단위 테스트 `weekly.spec.ts`)

- 1주 챌린지(7일·주3회): 전체 == 주간. 3회 달성 → 0원 / 1회 → penaltyAmount(회귀 동등성).
- 10일 챌린지(주3회): 1주차(1~7일) full goal 3, 자투리(8~10일, 3일) goal `ceil(3×3/7)=2`. 각 미달 시 penaltyAmount.
- 28일·주3회: 주1 달성·주2·주3 미달·주4 진행 → 확정 = 2×penaltyAmount, 현재 주는 합계 제외.
- 전원 달성: 누적 0원(현황판 placeholder 버그 회귀 방지).
- 마감 임박: 주3회·0회, 남은 2일 → `imminent=true`, atRiskAmount 명시.
- **over(만기·status active)**: 10일 챌린지 day 11+ → 자투리 주(8~10일) 포함 전 주가 `isWeekElapsed`(cutoff=durationDays), 확정 = 최종 per-head. week\*7 오판정 회귀 방지.
- **자연 closed**: closed_at >= end_at → cutoff=durationDays, 전 주 확정 = 정산 영수증 일치.
- **조기 closed(핵심 회귀 테스트)**: 28일·주3회를 **10일차 종료**(closed_at→day10) → cutoff=min(28,10)=10 → 1주차만 정산(2주차는 day14 끝이라 cutoff 초과 → 중도 잘림 미부과, 3·4주차 미발생 미부과). 미발생 주 charge=0 확인.
- **closed_at NULL 폴백**: 레거시 closed 행은 cutoff=durationDays(자연 종료로 취급).
- **stray 로그**: 시작 전·종료 후 created_at(dayIndex ∉ [1,durationDays])은 어느 주에도 안 잡힘.
- **현재 주 null**: over/closed 에서 `currentWeekStatus == null`(링·위험 미표시).
- 미시작(pending/accepted): 0원.

### 수동

- 현황판 모바일 viewport에서 H3 레이아웃·텍스트 비깨짐 확인(320/375px).

## Rollout

POC 표시-only 전제. 단계:

1. migration `challenges.closed_at` + ADR, 종료 경로(close `_actions`·auto-close cron)가 `closed_at = now()` set.
2. `weekly.ts` + `weekly.spec.ts`(로직·테스트 먼저, RED→GREEN). cutoff·자투리·조기종료 시나리오 포함.
3. `settlement.ts` 재정의 + 기존 spec 회귀 테스트 갱신.
4. read(`challenge-detail`/`current-challenges`/`recap`) 주차 집계 + `closed_at` 연결.
5. 현황판 placeholder 제거 + H3 컴포넌트(`week-chips`·`week-ring`) + `dashboard-tab` 교체. H3 카피는 동적 — "이번 주 **{shortfall}번 더** 채우면 추가 벌금 0원"(literal "3번" 금지, goalCount 1~7·자투리에 따라 가변).
6. 홈·정보탭·정산 라벨/값 정렬. confirmed-only 이므로 **정보탭 "모인 예정 벌금" · 홈 stat "예정 벌금" 둘 다 "예정" 제거**("지금까지 모인 벌금" / "내 벌금") — 인증해도 즉시 안 줄어 "예정"이 오해. 현황판 헤더 D-day 와 이번 주 링은 마지막 주에서 값이 같으므로 "전체 D-N" vs "이번 주 마감"으로 문구 구분. `penaltyAmount=0` 챌린지는 위험/+원 UI 미표시.

후속(별도): `docs/PRD.md §3.3·§11`와 `docs/BE_SCHEMA.md §11`의 goalCount 측정 단위 서술을 본 모델로 업데이트(문서 동기화). 온보딩(`src/app/.../onboarding-slides.tsx`)·`penalty-picker.tsx` 의 **"하루 미인증마다 벌금 누적"(일 단위) 카피를 "주 목표 미달 시"(주 단위)로 정정** — 현재 카피가 모델과 어긋남(PROJECT_LOG 2026-05-28 지적). 운영 데이터 후 자투리 전액·무여유 트리거 재검토.

### 롤백

`settlement.ts`를 전체 1회 평가로 되돌리고 현황판은 placeholder(0원) 복원. read 함수의 주차 집계 제거. `challenges.closed_at` 은 nullable 추가라 그대로 두면 무해(POC 단방향 — drop 안 함). 데이터 롤백 불필요.
