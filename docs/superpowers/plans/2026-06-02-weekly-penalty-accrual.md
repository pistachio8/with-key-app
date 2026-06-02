# 주 단위 벌금 누적 모델 재정의 + 현황판 H3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챌린지 벌금을 "주(week) 단위 누적 모델"로 재정의하고, 현황판(dashboard)에 "확정 벌금(단조 증가)"과 "현재 주 위험(회복 가능)"을 분리해 보여주는 H3 표현을 구현한다.

**Architecture:** 순수 함수 모듈 `src/lib/challenge/weekly.ts`에 주차 인덱싱·주차 목표(자투리 ceil)·cutoff(조기 종료 포함)·확정 벌금·현재 주 상태·MVP 로직을 모두 모으고, 4개 read 함수(`challenge-detail`·`current-challenges`·`recap`)가 이 모듈로 위임한다. 기존 `settlement.ts`(전체 1회 평가)는 삭제한다. 시간 의존 값은 RSC render 시점 `now` 1회로 계산(`feed-time.ts` 패턴). 조기 종료 cutoff용으로 `challenges.closed_at` 컬럼을 신설한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Vitest · Supabase(Postgres migration) · Tailwind v4 토큰.

---

## Background (구현 전 필독)

이 plan은 `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`(이하 "spec")를 구현한다. spec의 §Design C0~C6, §Verification 시나리오, §Rollout 단계를 그대로 따른다. 아래는 zero-context 엔지니어가 알아야 할 핵심 사실이다.

### 용어 (spec §Design)

- **주차(week)**: 챌린지 시작일을 1일차로 한 7일 묶음. 달력 월요일이 아님. `dayIndex 1..7` → week 1, `8..14` → week 2.
- **주차 목표(weekGoal)**: 그 주에 채워야 할 인증 횟수. full week 는 `goalCount` 그대로, 마지막 자투리 주(7일 미만)만 일수 비례(올림).
- **확정 벌금(confirmedPenalty)**: 이미 끝난 주의 미달 합. 단조 증가(인증을 더 해도 줄지 않음, 주 경계에서만 증가).
- **현재 주 위험(currentWeekStatus)**: 진행 중인 주가 지금 이대로 끝나면 물게 될 잠정 금액. 회복 가능. 어떤 합계에도 더하지 않는다.
- **cutoff(cutoffDayIndex)**: "챌린지가 실제 진행된 마지막 일차". 끝난 주 판정의 기준. 조기 종료 시 `closed_at`까지만.

### 현재 코드의 문제 (spec §Why)

1. `src/lib/challenge/settlement.ts`의 `computePerHeadPenalty`는 전체 기간 `doneCount >= goalCount`로 1회 평가하는데, `goalCount`는 의미상 "주 N회"(1~7)다. 90일 챌린지에서 3일만 인증해도 "성공·0원"이 된다.
2. `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx:30`의 `totalFailures = 0`은 placeholder라 현황판 "누적 벌금"이 항상 0원이다.
3. 라벨 혼재: 홈 "예정 벌금" · 정보탭 "모인 예정 벌금" · 현황판 "누적 벌금"이 "이미 낸 것"과 "막을 수 있는 것"을 한 숫자에 섞는다.

### 확정 산정 규칙 (spec §C0, 사용자 결정 2026-06-02)

- **주 미달 = 전액(all-or-nothing)**: `doneInWeek < weekGoal`이면 done 수와 무관하게 `penaltyAmount` 전액. 부족분 비례 없음.
- **자투리 주도 미달 시 전액**: 목표만 ceil 비례, 벌금은 비례 안 함.
- **홈 "예정 벌금" stat = 내 확정 벌금만**(단조). 인증해도 즉시 0으로 안 떨어진다.
- **MVP = 끝난 모든 주 목표를 빠짐없이 달성한 멤버 중 총 인증일 최다**(동률 공동).
- **조기 종료 = 잔여·중도 주 미부과**: 오너가 `end_at` 전에 수동 종료하면 종료일까지 완전히 끝난 주만 확정. 미발생 주와 종료 시점에 잘린 부분 주는 charge 안 함. `challenges.closed_at`에 종료 시각 저장.

### 설계 결정 (이 plan 한정, 2026-06-02 사용자 확인)

- **현황판 H3**: 주차 칩과 "이번 주 링"은 **viewer(나) 개인 기록** 기준. 그룹 누적 금액(`potTotal`)은 별도 행. 기존 `member-strip`(멤버별 진행률 바)은 **유지**한다.
- **settlement.ts 처리**: `weekly.ts`로 일원화하고 `settlement.ts`·`settlement.spec.ts`를 **삭제**한다. 호출처 4곳(`home/page.tsx`·`current-challenges.ts`·`recap.ts`·`challenge-detail.ts`)을 모두 교체한다.
- **화면 표기 통일(spec Why "라벨 혼재" 해소)**: 그룹 확정값(`potTotal`)을 표시하는 **모든** 화면(홈 running/settlement 리스트 · 정보탭 · 현황판)을 **"모인 벌금"**으로 통일. 개인 확정은 홈 "내 벌금" · 영수증 "나의 정산". 주 단위와 어긋나는 일 단위 카피(온보딩 "하루 안에…" · penalty-picker "1회 실패")는 "주 목표 미달 시"로 정정. 인증 실패 dialog(`FailedBody`)는 일 단위지만 dormant(미trigger)라 코드 변경 없이 향후 주의만 남긴다.

### 시간 의존 + 캐시 주의 (spec §C0, §C3 NOTE)

- `confirmedPenalty`·`currentWeekStatus`는 "오늘"에 의존(주 경계에서 값이 바뀜). `now`를 RSC render 시점에 1회 계산해 인자로 내려보낸다. 장기 cache 에 baking 금지.
- `fetchChallengeDetail`은 React `cache()`(요청 범위 메모이제이션)라 매 요청 새로 실행 → `now`를 내부에서 잡아도 stale 없음.
- `fetchCurrentChallengesInner`는 `"use cache: private"` + `cacheLife("minutes")`다. 주 경계는 하루 단위 변화라 분 단위 캐시의 stale은 자정 직후 최대 1분으로 무해. `now`를 내부에서 잡되 이 한계를 코드 주석에 명시한다.
- `closed`/`over` phase는 `today` 비의존이라 deterministic. `running`만 `today` 의존.

### 검증 명령

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

전체 작업 완료 후 `pnpm build`까지 1회 실행한다(migration·env·route 변경 포함).

---

## File Structure

작업이 만들거나 바꾸는 파일과 각 책임:

**신규**

- `supabase/migrations/0041_challenge_closed_at.sql` — `challenges.closed_at timestamptz` 추가(조기 종료 cutoff용).
- `docs/adr/0030-early-close-settlement-cutoff.md` — 조기 종료 정산 cutoff 결정 기록(spec-required: `supabase/migrations/**`). (번호 0029 는 PWA/Expo trigger draft 가 예약 — PROJECT_LOG 2026-06-01.)
- `src/lib/challenge/weekly.ts` — 주차 인덱싱·목표·cutoff·확정/위험 벌금·MVP·주차 칩 빌더(순수 함수 SoT).
- `src/lib/challenge/weekly.spec.ts` — `weekly.ts` 단위 테스트(spec §Verification 시나리오 전부).
- `src/app/(app)/challenge/[id]/_components/week-chips.tsx` — 주차별 기록 칩(H3 주인공).
- `src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx` — 칩 렌더 테스트.
- `src/app/(app)/challenge/[id]/_components/week-ring.tsx` — 이번 주 진척 링 + 동적 카피.
- `src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx` — 링 카피 테스트.

**수정**

- `src/lib/db/reads/challenge-detail.ts` — 주차 집계, 주 단위 `potTotal`, `closedAt` + 멤버별 `doneByWeek` 추가.
- `src/lib/db/reads/current-challenges.ts` — 주 단위 `potTotal`, `myConfirmedPenalty`, `closed_at` SELECT.
- `src/lib/db/reads/recap.ts` — `buildRecapView` 주 단위 + cutoff(`closed_at`) 재정의 + 주차 요약 필드.
- `src/lib/db/reads/recap.spec.ts` — 주 단위 테스트로 갱신.
- `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` — 목표 라벨 주 단위화("주 N회") + 주차 달성 요약 행.
- `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx` — 주 단위 데이터로 갱신(goalCount 1~7).
- `src/app/(app)/home/page.tsx` — `totalPenalty`를 `myConfirmedPenalty` 합으로.
- `src/app/(app)/home/_components/stats-grid.tsx` — "예정 벌금" → "내 벌금".
- `src/app/(app)/home/_components/running-challenge-list.tsx` — "누적 벌금" → "모인 벌금"(라벨 통일).
- `src/app/(app)/home/_components/settlement-pending-list.tsx` — "누적 벌금" → "모인 벌금"(라벨 통일).
- `src/app/(app)/challenge/[id]/_components/info-tab.tsx` — "모인 예정 벌금" → "모인 벌금".
- `src/app/(auth)/login/_components/onboarding-slides.tsx` — 일 단위 카피("하루 안에…") → 주 단위.
- `src/app/(flow)/challenge/new/_components/penalty-picker.tsx` — "1회 실패 시" → "주 목표 미달 시".
- `src/app/(app)/challenge/[id]/_actions.ts` — `endChallenge`가 `closed_at = now()` set.
- `src/app/api/cron/deadline-push/route.ts` — auto-close가 `closed_at = now()` set.
- `src/app/api/cron/deadline-push/route.spec.ts` — closed_at 포함 검증으로 갱신.
- `src/app/(app)/challenge/[id]/recap/page.tsx` — 영수증에 주차 요약 props 전달(Task 5) + 부정확한 주석 정정(Task 8).
- `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` — placeholder 제거, H3 데이터 계산·전달.
- `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx` — H3 레이아웃(칩 + 링 + 누적 금액 + strip).
- `src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx` — H3 테스트로 갱신.

**삭제**

- `src/lib/challenge/settlement.ts`
- `src/lib/challenge/settlement.spec.ts`

---

## Task 1: migration + ADR (closed_at)

조기 종료 cutoff 산정용 `challenges.closed_at` 컬럼을 추가한다. spec-required(`supabase/migrations/**`)라 ADR을 동반한다.

**Files:**

- Create: `supabase/migrations/0041_challenge_closed_at.sql`
- Create: `docs/adr/0030-early-close-settlement-cutoff.md`

- [ ] **Step 1: migration 파일 작성**

기존 migration 번호 맨 뒤(0040)에 0041로 추가한다(재정렬 금지, down 스크립트 없음 — POC 단방향).

```sql
-- supabase/migrations/0041_challenge_closed_at.sql
-- ADR-0030 — 조기 종료 정산 cutoff 산정용.
-- 종료 경로(endChallenge action · auto-close cron)가 status='closed' 전이와 함께
-- closed_at = now() 로 1회 set 한다. nullable — 진행 중/레거시 행은 NULL(폴백=duration_days).
-- RLS 변경 없음: 기존 challenges UPDATE 정책(challenges_update_pending_owner · admin client) 내에서 갱신.

alter table public.challenges
  add column if not exists closed_at timestamptz;

comment on column public.challenges.closed_at is
  '챌린지 종료(closed) 시각. 조기 종료 정산 cutoff 산정용. NULL=미종료 또는 레거시(폴백 duration_days).';
```

- [ ] **Step 2: ADR 작성**

```markdown
<!-- docs/adr/0030-early-close-settlement-cutoff.md -->

# ADR-0030: 조기 종료 정산 cutoff (`challenges.closed_at`)

- Status: Accepted
- Date: 2026-06-02
- 관련: spec `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`, ADR-0027(derived-over-autoclose)

## Context

벌금을 주 단위 누적 모델로 재정의하면서(spec C3), "끝난 주만 정산"의 기준일(cutoff)이 필요해졌다.
자연 종료(만기 또는 auto-close)는 `duration_days`까지 전 주가 정산되지만, 운영자가 `end_at` 전에
수동 종료(조기 종료)하면 아직 시작도 안 한 미래 주와 종료 시점에 잘린 부분 주를 charge 하면 안 된다
(사용자 결정: 잔여·중도 주 미부과). 기존 스키마에는 "언제 종료했는가"를 알 수 있는 컬럼이 없었다
(`status='closed'`만 있고 시각 없음).

## Decision

`challenges.closed_at timestamptz null` 컬럼을 추가한다. 종료 경로 둘(`endChallenge` Server Action·
auto-close cron `deadline-push`)이 `status='closed'` 전이와 함께 `closed_at = now()`를 set 한다.

cutoff 산정(`src/lib/challenge/weekly.ts` `cutoffDayIndex`):

- `running`: `todayDayIndex - 1`(완료된 날만)
- `over`(만기·status=active): `duration_days`
- `closed`: `closed_at` 있으면 `min(duration_days, dayIndexOf(closed_at))`, NULL이면 `duration_days`(자연 종료로 폴백)

자연 종료는 `closed_at >= end_at`이라 `min(...)`이 `duration_days`로 수렴해 전 주 정산.
조기 종료는 `closed_at < end_at`이라 종료일까지의 완전히 끝난 주만 정산된다.

## Consequences

- nullable 추가라 기존 행은 NULL → 폴백(`duration_days`)으로 자연 종료처럼 취급. 데이터 backfill 불필요.
- RLS 변경 없음. 기존 UPDATE 정책 경로(admin client·owner 검증)에서 함께 갱신.
- 롤백: 컬럼을 그대로 두면 무해(POC 단방향, drop 안 함). cutoff 로직만 `duration_days` 폴백으로 되돌리면 됨.
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0041_challenge_closed_at.sql docs/adr/0030-early-close-settlement-cutoff.md
git commit -m "feat(challenge): challenges.closed_at 추가 + ADR-0030 (조기 종료 cutoff)"
```

---

## Task 2: weekly.ts 코어 로직 (순수 함수, TDD)

주 단위 모델의 SoT. 모든 read 함수와 화면이 이 모듈로 위임한다. TDD로 작성한다(테스트 먼저).

**Files:**

- Create: `src/lib/challenge/weekly.ts`
- Test: `src/lib/challenge/weekly.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (인덱싱·목표)**

`src/lib/challenge/weekly.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  weekIndexOf,
  totalWeeks,
  weekGoal,
  weekEndDayIndex,
  cutoffDayIndex,
  elapsedWeeks,
  weekBucketsFromDayKeys,
  countDoneDaysByUserByWeek,
  confirmedPenalty,
  achievedAllElapsedWeeks,
  doneInElapsedWeeks,
  countAchievedWeeks,
  computeAccruedPot,
  pickMvpIds,
  currentWeekStatus,
  buildWeekChips,
  type CutoffContext,
} from "./weekly";

describe("weekIndexOf / totalWeeks / weekEndDayIndex", () => {
  it("dayIndex 1..7 → week 1, 8..14 → week 2", () => {
    expect(weekIndexOf(1)).toBe(1);
    expect(weekIndexOf(7)).toBe(1);
    expect(weekIndexOf(8)).toBe(2);
    expect(weekIndexOf(14)).toBe(2);
    expect(weekIndexOf(15)).toBe(3);
  });

  it("totalWeeks = ceil(durationDays / 7)", () => {
    expect(totalWeeks(7)).toBe(1);
    expect(totalWeeks(10)).toBe(2);
    expect(totalWeeks(28)).toBe(4);
    expect(totalWeeks(90)).toBe(13);
  });

  it("weekEndDayIndex 는 자투리 주에서 durationDays 로 클램프", () => {
    expect(weekEndDayIndex(1, 10)).toBe(7);
    expect(weekEndDayIndex(2, 10)).toBe(10); // min(14, 10)
    expect(weekEndDayIndex(4, 28)).toBe(28);
  });
});

describe("weekGoal", () => {
  it("full week 는 goalCount 그대로", () => {
    expect(weekGoal(1, 2, 3, 10)).toBe(3);
    expect(weekGoal(1, 4, 3, 28)).toBe(3); // 28%7===0 → 마지막 주도 full
    expect(weekGoal(4, 4, 3, 28)).toBe(3);
  });

  it("마지막 자투리 주만 일수 비례(올림)", () => {
    // 10일·주3회: 자투리 3일 → ceil(3*3/7)=ceil(1.28)=2
    expect(weekGoal(2, 2, 3, 10)).toBe(2);
    // 8일·주7회: 자투리 1일 → ceil(7*1/7)=1
    expect(weekGoal(2, 2, 7, 8)).toBe(1);
    // 13일·주3회: 자투리 6일 → ceil(3*6/7)=ceil(2.57)=3
    expect(weekGoal(2, 2, 3, 13)).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: FAIL — "Failed to resolve import './weekly'" 또는 함수 미정의.

- [ ] **Step 3: weekly.ts 인덱싱·목표 함수 구현**

`src/lib/challenge/weekly.ts`:

```ts
// 주 단위 벌금 누적 모델의 SoT (spec 2026-06-02-weekly-penalty-accrual).
// goalCount(1~7) = "주 N회"(주간 빈도). 주차별로 목표를 평가·누적한다.
// 시간 의존(confirmedPenalty·currentWeekStatus)은 호출처가 now 를 1회 계산해 ctx 로 내려보낸다.
import { toKstDayKey, dayIndexOf } from "./done-days";

// dayIndex 1-based(시작일=1). week 1-based.
export function weekIndexOf(dayIndex: number): number {
  return Math.floor((dayIndex - 1) / 7) + 1;
}

export function totalWeeks(durationDays: number): number {
  return Math.ceil(durationDays / 7);
}

// 마지막 자투리 주만 일수 비례(올림), 그 외 full week 는 goalCount 그대로.
export function weekGoal(
  week: number,
  total: number,
  goalCount: number,
  durationDays: number,
): number {
  if (week < total || durationDays % 7 === 0) return goalCount;
  const remDays = durationDays - (total - 1) * 7; // 1..6
  return Math.ceil((goalCount * remDays) / 7);
}

// 한 주가 끝나는 일차 — 자투리(마지막) 주는 durationDays 로 클램프. week*7 직접 사용 금지.
export function weekEndDayIndex(week: number, durationDays: number): number {
  return Math.min(week * 7, durationDays);
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: Step 1의 3개 describe PASS.

- [ ] **Step 5: cutoff·elapsedWeeks 실패 테스트 추가**

`src/lib/challenge/weekly.spec.ts`에 append:

```ts
describe("cutoffDayIndex / elapsedWeeks", () => {
  const base = { durationDays: 28, todayDayIndex: 0, closedAt: null, startKey: "2026-05-01" };

  it("running: today-1 (완료된 날만)", () => {
    const ctx: CutoffContext = { ...base, phase: "running", todayDayIndex: 16 };
    expect(cutoffDayIndex(ctx)).toBe(15);
  });

  it("over: durationDays (예정 전 주 실제 진행)", () => {
    const ctx: CutoffContext = { ...base, phase: "over" };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("closed 자연 종료(closed_at >= end_at): durationDays 로 수렴", () => {
    // 28일 챌린지, start 2026-05-01 → day28 = 2026-05-28. closed_at 2026-05-29 → dayIndex 29 → min(28,29)=28
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-29T01:00:00Z" };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("closed 조기 종료(closed_at < end_at): 종료일까지만", () => {
    // start 2026-05-01 → day10 = 2026-05-10. closed_at 2026-05-10 → dayIndex 10 → min(28,10)=10
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-10T01:00:00Z" };
    expect(cutoffDayIndex(ctx)).toBe(10);
  });

  it("closed_at NULL 폴백: durationDays", () => {
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: null };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("elapsedWeeks: 조기 종료 day10 → 1주차만(week2 end=14 > 10)", () => {
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-10T01:00:00Z" };
    expect(elapsedWeeks(ctx)).toEqual([1]);
  });

  it("elapsedWeeks: over 10일 챌린지 → 자투리 주 포함 전 주", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(elapsedWeeks(ctx)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 6: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: FAIL — `cutoffDayIndex`/`elapsedWeeks` 미정의.

- [ ] **Step 7: cutoff·elapsedWeeks 구현**

`src/lib/challenge/weekly.ts`에 append:

```ts
export type CutoffPhase = "running" | "over" | "closed";

// 시간 의존 계산용 컨텍스트. 호출처(RSC)가 now 로 todayDayIndex 를 계산해 채운다.
export type CutoffContext = {
  phase: CutoffPhase;
  durationDays: number;
  todayDayIndex: number; // running 전용 (over/closed 면 무시)
  closedAt: string | null; // closed 전용
  startKey: string; // closed_at → dayIndex 변환 (KST day key)
};

// 정산 기준 마지막 일차 = "챌린지가 실제 진행된 마지막 날".
export function cutoffDayIndex(ctx: CutoffContext): number {
  if (ctx.phase === "running") return ctx.todayDayIndex - 1;
  if (ctx.phase === "over") return ctx.durationDays;
  // closed
  if (!ctx.closedAt) return ctx.durationDays;
  return Math.min(ctx.durationDays, dayIndexOf(toKstDayKey(ctx.closedAt), ctx.startKey));
}

// cutoff 안에 완전히 들어온(끝까지 진행된) 주 번호들. 부분 잘린 주·미발생 주 제외.
export function elapsedWeeks(ctx: CutoffContext): number[] {
  const total = totalWeeks(ctx.durationDays);
  const cutoff = cutoffDayIndex(ctx);
  const out: number[] = [];
  for (let w = 1; w <= total; w++) {
    if (weekEndDayIndex(w, ctx.durationDays) <= cutoff) out.push(w);
  }
  return out;
}
```

- [ ] **Step 8: 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: cutoff/elapsedWeeks describe PASS.

- [ ] **Step 9: 집계(week bucket) 실패 테스트 추가**

`src/lib/challenge/weekly.spec.ts`에 append:

```ts
describe("weekBucketsFromDayKeys / countDoneDaysByUserByWeek", () => {
  const startKey = "2026-05-01";

  it("dayKey 를 주차 버킷으로 분배 (하루 1회)", () => {
    // 2026-05-01(day1·week1), 2026-05-02(day2·week1), 2026-05-09(day9·week2)
    const buckets = weekBucketsFromDayKeys(
      ["2026-05-01", "2026-05-02", "2026-05-09"],
      startKey,
      28,
    );
    expect(buckets.get(1)).toBe(2);
    expect(buckets.get(2)).toBe(1);
  });

  it("stray 로그 가드: dayIndex 가 [1, durationDays] 밖이면 버킷 제외", () => {
    // 2026-04-30(day0·시작 전), 2026-05-29(day29·종료 후, duration 28)
    const buckets = weekBucketsFromDayKeys(["2026-04-30", "2026-05-29"], startKey, 28);
    expect(buckets.size).toBe(0);
  });

  it("countDoneDaysByUserByWeek: 같은 날 N개 로그 → 1 (distinct day) 후 주차 분배", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-01T00:00:00Z" }, // KST day1
      { user_id: "u-a", created_at: "2026-05-01T10:00:00Z" }, // 같은 날
      { user_id: "u-a", created_at: "2026-05-08T00:00:00Z" }, // KST day8 week2
      { user_id: "u-b", created_at: "2026-05-02T00:00:00Z" },
    ];
    const out = countDoneDaysByUserByWeek(logs, startKey, 28);
    expect(out.get("u-a")?.get(1)).toBe(1);
    expect(out.get("u-a")?.get(2)).toBe(1);
    expect(out.get("u-b")?.get(1)).toBe(1);
  });
});
```

> 주의: `toKstDayKey`는 UTC 15:00 부터 다음 KST 날. 위 테스트의 `T00:00:00Z`는 KST 09:00이라 같은 날짜다.

- [ ] **Step 10: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: FAIL — `weekBucketsFromDayKeys`/`countDoneDaysByUserByWeek` 미정의.

- [ ] **Step 11: 집계 함수 구현**

`src/lib/challenge/weekly.ts`에 append:

```ts
// KST day key 들을 주차 버킷(week → count)으로 분배. stray(범위 밖) 제외.
export function weekBucketsFromDayKeys(
  dayKeys: Iterable<string>,
  startKey: string,
  durationDays: number,
): Map<number, number> {
  const byWeek = new Map<number, number>();
  for (const dayKey of dayKeys) {
    const di = dayIndexOf(dayKey, startKey);
    if (di < 1 || di > durationDays) continue; // 시작 전·종료 후 stray 가드
    const week = weekIndexOf(di);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }
  return byWeek;
}

// 하루 N개 인증도 1회(KST distinct day) 후 주차 버킷에 분배.
export function countDoneDaysByUserByWeek(
  logs: ReadonlyArray<{ user_id: string; created_at: string }>,
  startKey: string,
  durationDays: number,
): Map<string, Map<number, number>> {
  const daySetByUser = new Map<string, Set<string>>();
  for (const l of logs) {
    let s = daySetByUser.get(l.user_id);
    if (!s) {
      s = new Set<string>();
      daySetByUser.set(l.user_id, s);
    }
    s.add(toKstDayKey(l.created_at));
  }
  const out = new Map<string, Map<number, number>>();
  for (const [user, days] of daySetByUser) {
    out.set(user, weekBucketsFromDayKeys(days, startKey, durationDays));
  }
  return out;
}
```

- [ ] **Step 12: 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: 집계 describe PASS.

- [ ] **Step 13: 벌금·MVP 실패 테스트 추가**

`src/lib/challenge/weekly.spec.ts`에 append:

```ts
type DoneByWeek = Map<number, number>;
const dbw = (entries: Array<[number, number]>): DoneByWeek => new Map(entries);

describe("confirmedPenalty / achievedAllElapsedWeeks / doneInElapsedWeeks", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("28일·주3회: 주1 달성·주2·주3 미달·주4 진행 중 → 확정 = 2×penalty", () => {
    // running, today day25(week4). cutoff=24 → elapsed weeks 1,2,3 (week4 end=28 > 24 제외)
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const done = dbw([
      [1, 3], // 달성
      [2, 1], // 미달
      [3, 0], // 미달
      [4, 2], // 진행 중 (합계 제외)
    ]);
    expect(confirmedPenalty(done, ctx, params)).toBe(6000);
  });

  it("전원 달성 시 0원 (현황판 placeholder 버그 회귀 방지)", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 3]]), ctx, params)).toBe(0);
    expect(achievedAllElapsedWeeks(dbw([[1, 3]]), ctx, { goalCount: 3 })).toBe(true);
  });

  it("penaltyAmount 음수/NaN 방어 → 0", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: -1 })).toBe(0);
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: NaN })).toBe(0);
  });

  it("1주 챌린지(7일·주3회) 회귀 동등성: 3회→0 / 1회→penalty", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 3]]), ctx, params)).toBe(0);
    expect(confirmedPenalty(dbw([[1, 1]]), ctx, params)).toBe(3000);
  });

  it("10일·주3회 자투리: week2 goal=2, 미달 시 penalty", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(
      confirmedPenalty(
        dbw([
          [1, 3],
          [2, 2],
        ]),
        ctx,
        params,
      ),
    ).toBe(0); // 둘 다 달성
    expect(
      confirmedPenalty(
        dbw([
          [1, 3],
          [2, 1],
        ]),
        ctx,
        params,
      ),
    ).toBe(3000); // 자투리 미달
  });

  it("조기 closed day10: 28일·주3회 → 1주차만 정산, 미발생 주 charge=0", () => {
    const ctx: CutoffContext = {
      phase: "closed",
      durationDays: 28,
      todayDayIndex: 0,
      closedAt: "2026-05-10T01:00:00Z",
      startKey: "2026-05-01",
    };
    // week1 미달 → 3000. week2(end14 > cutoff10 중도 잘림)·week3·week4 미발생 → 미부과
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, params)).toBe(3000);
  });

  it("doneInElapsedWeeks: 끝난 주 done 합 (현재/미발생 주 제외)", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(
      doneInElapsedWeeks(
        dbw([
          [1, 3],
          [2, 1],
          [3, 2],
          [4, 5],
        ]),
        ctx,
      ),
    ).toBe(6); // week4 제외
  });

  it("countAchievedWeeks: 끝난 주 중 달성 주 수 (영수증 'N주 중 M주')", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    // elapsed weeks 1,2,3. week1 달성·week2 미달·week3 달성 → 2
    expect(
      countAchievedWeeks(
        dbw([
          [1, 3],
          [2, 1],
          [3, 3],
          [4, 0],
        ]),
        ctx,
        { goalCount: 3 },
      ),
    ).toBe(2);
  });
});

describe("computeAccruedPot / pickMvpIds", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };
  const ctx: CutoffContext = {
    phase: "over",
    durationDays: 14,
    todayDayIndex: 0,
    closedAt: null,
    startKey: "2026-05-01",
  };

  it("computeAccruedPot: 미달자만 합산", () => {
    const members = [
      {
        doneByWeek: dbw([
          [1, 3],
          [2, 3],
        ]),
      }, // 달성 0원
      {
        doneByWeek: dbw([
          [1, 1],
          [2, 3],
        ]),
      }, // week1 미달 3000
      {
        doneByWeek: dbw([
          [1, 0],
          [2, 0],
        ]),
      }, // 둘 다 미달 6000
    ];
    expect(computeAccruedPot(members, ctx, params)).toBe(9000);
  });

  it("pickMvpIds: 끝난 모든 주 달성자 중 총 인증일 최다 (동률 공동)", () => {
    const members = [
      {
        id: "a",
        doneByWeek: dbw([
          [1, 3],
          [2, 3],
        ]),
      }, // 달성, 총 6
      {
        id: "b",
        doneByWeek: dbw([
          [1, 3],
          [2, 4],
        ]),
      }, // 달성, 총 7
      {
        id: "c",
        doneByWeek: dbw([
          [1, 1],
          [2, 7],
        ]),
      }, // week1 미달 → 후보 제외
    ];
    expect(pickMvpIds(members, ctx, { goalCount: 3 })).toEqual(["b"]);
  });

  it("pickMvpIds: 달성자 없으면 빈 배열", () => {
    const members = [
      {
        id: "a",
        doneByWeek: dbw([
          [1, 1],
          [2, 1],
        ]),
      },
    ];
    expect(pickMvpIds(members, ctx, { goalCount: 3 })).toEqual([]);
  });

  it("불변식 (ii): 단일 멤버 computeAccruedPot == 그 멤버 confirmedPenalty (이중 SoT 방지)", () => {
    // 현황판 potTotal(내 몫)·홈 myConfirmedPenalty·recap viewerPerHeadPenalty 가 같은 cutoff·함수를
    // 쓰면 동일해야 한다. 같은 ctx·doneByWeek 로 두 경로가 일치함을 함수 레벨에서 못박는다.
    const doneByWeek = dbw([
      [1, 1],
      [2, 3],
    ]); // week1 미달 → 3000
    expect(computeAccruedPot([{ doneByWeek }], ctx, params)).toBe(
      confirmedPenalty(doneByWeek, ctx, params),
    );
  });
});
```

- [ ] **Step 14: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: FAIL — `confirmedPenalty` 등 미정의.

- [ ] **Step 15: 벌금·MVP 함수 구현**

`src/lib/challenge/weekly.ts`에 append:

```ts
export type WeeklyParams = { goalCount: number; penaltyAmount: number };

// 끝난 주만 합산 → 단조 증가(현재 주·미발생 주 미포함이라 변동 없음).
export function confirmedPenalty(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): number {
  if (!Number.isFinite(params.penaltyAmount) || params.penaltyAmount <= 0) return 0;
  const total = totalWeeks(ctx.durationDays);
  let sum = 0;
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    const done = doneByWeek.get(week) ?? 0;
    if (done < goal) sum += params.penaltyAmount;
  }
  return sum;
}

// 끝난 모든 주의 목표를 빠짐없이 달성했는가 (penalty 무관 — 0원 챌린지 판정용).
export function achievedAllElapsedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: { goalCount: number },
): boolean {
  const total = totalWeeks(ctx.durationDays);
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    if ((doneByWeek.get(week) ?? 0) < goal) return false;
  }
  return true;
}

// 끝난 주의 done 합 (MVP 총 인증일·영수증 "나의 인증" 용).
export function doneInElapsedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
): number {
  let sum = 0;
  for (const week of elapsedWeeks(ctx)) sum += doneByWeek.get(week) ?? 0;
  return sum;
}

// 끝난 주 중 목표를 달성한 주 수 (영수증 "N주 중 M주 달성" 표시용).
export function countAchievedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: { goalCount: number },
): number {
  const total = totalWeeks(ctx.durationDays);
  let n = 0;
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    if ((doneByWeek.get(week) ?? 0) >= goal) n += 1;
  }
  return n;
}

// 그룹 누적 = Σ member confirmedPenalty (끝난 주만). status 가드는 호출처가 담당.
export function computeAccruedPot(
  members: ReadonlyArray<{ doneByWeek: ReadonlyMap<number, number> }>,
  ctx: CutoffContext,
  params: WeeklyParams,
): number {
  return members.reduce((sum, m) => sum + confirmedPenalty(m.doneByWeek, ctx, params), 0);
}

// 끝난 모든 주 달성자 중 총 인증일 최다 (동률 공동). POC 표시용.
export function pickMvpIds(
  members: ReadonlyArray<{ id: string; doneByWeek: ReadonlyMap<number, number> }>,
  ctx: CutoffContext,
  params: { goalCount: number },
): ReadonlyArray<string> {
  const achievers = members.filter((m) =>
    achievedAllElapsedWeeks(m.doneByWeek, ctx, { goalCount: params.goalCount }),
  );
  if (achievers.length === 0) return [];
  const totals = achievers.map((m) => doneInElapsedWeeks(m.doneByWeek, ctx));
  const max = Math.max(...totals);
  return achievers.filter((_, i) => totals[i] === max).map((m) => m.id);
}
```

- [ ] **Step 16: 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: 벌금·MVP describe PASS.

- [ ] **Step 17: 현재 주 상태·주차 칩 실패 테스트 추가**

`src/lib/challenge/weekly.spec.ts`에 append:

```ts
describe("currentWeekStatus", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("over/closed 면 null (링·위험 미표시)", () => {
    const overCtx: CutoffContext = {
      phase: "over",
      durationDays: 28,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(currentWeekStatus(new Map(), overCtx, params)).toBeNull();
  });

  it("running: 이번 주 week·goal·done·shortfall 산출", () => {
    // today day10 → week2. done 1 → shortfall 2. weekEnd(week2,28)=14, daysLeft=14-10+1=5
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 10,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[2, 1]]), ctx, params);
    expect(s).not.toBeNull();
    expect(s?.week).toBe(2);
    expect(s?.goal).toBe(3);
    expect(s?.done).toBe(1);
    expect(s?.daysLeftInWeek).toBe(5);
    expect(s?.shortfall).toBe(2);
    expect(s?.atRiskAmount).toBe(3000);
    expect(s?.imminent).toBe(false); // daysLeft 5 > shortfall 2
  });

  it("마감 임박(무여유): done 1·shortfall 2, 남은 2일 → imminent=true", () => {
    // duration 7, today day6 → week1. weekEnd=7 daysLeft=7-6+1=2. shortfall 2 → daysLeft<=shortfall
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 1]]), ctx, params); // done 1, shortfall 2, daysLeft 2
    expect(s?.imminent).toBe(true); // daysLeft 2 <= shortfall 2
    expect(s?.atRiskAmount).toBe(3000);
  });

  it("마감 임박 spec 정확 케이스: 주3회·0회, 남은 2일 → imminent=true", () => {
    // duration 7, today day6 → week1. done 0, shortfall 3, weekEnd 7, daysLeft 2 → 2 <= 3
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(new Map(), ctx, params); // done 0
    expect(s?.shortfall).toBe(3);
    expect(s?.imminent).toBe(true);
    expect(s?.atRiskAmount).toBe(3000);
  });

  it("0원 챌린지: atRiskAmount=0, imminent=false", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: 0 });
    expect(s?.atRiskAmount).toBe(0);
    expect(s?.imminent).toBe(false);
  });
});

describe("buildWeekChips", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("running 28일·주3회 today day10(week2): 달성/미달/현재/미래 상태", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 10,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const chips = buildWeekChips(
      dbw([
        [1, 3],
        [2, 1],
      ]),
      ctx,
      params,
    );
    expect(chips).toEqual([
      { week: 1, goal: 3, done: 3, state: "achieved" },
      { week: 2, goal: 3, done: 1, state: "current" },
      { week: 3, goal: 3, done: 0, state: "future" },
      { week: 4, goal: 3, done: 0, state: "future" },
    ]);
  });

  it("over 10일·주3회: 자투리 주 goal=2, 끝난 주는 달성/미달", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const chips = buildWeekChips(
      dbw([
        [1, 3],
        [2, 1],
      ]),
      ctx,
      params,
    );
    expect(chips).toEqual([
      { week: 1, goal: 3, done: 3, state: "achieved" },
      { week: 2, goal: 2, done: 1, state: "missed" },
    ]);
  });
});
```

- [ ] **Step 18: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: FAIL — `currentWeekStatus`/`buildWeekChips` 미정의.

- [ ] **Step 19: 현재 주 상태·주차 칩 구현**

`src/lib/challenge/weekly.ts`에 append:

```ts
export type CurrentWeekStatus = {
  week: number;
  goal: number;
  done: number;
  daysLeftInWeek: number; // 오늘 포함, 자투리 클램프 적용
  shortfall: number;
  atRiskAmount: number; // 이대로 끝나면 물 금액 (회복 가능). 0원 챌린지·달성 시 0
  imminent: boolean; // 무여유: 남은 가능일 <= 부족분
};

// 진행 중인 주 상태 — phase==='running' 일 때만. over/closed 면 null.
export function currentWeekStatus(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): CurrentWeekStatus | null {
  if (ctx.phase !== "running") return null;
  const total = totalWeeks(ctx.durationDays);
  const week = weekIndexOf(ctx.todayDayIndex);
  const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
  const done = doneByWeek.get(week) ?? 0;
  const daysLeftInWeek = weekEndDayIndex(week, ctx.durationDays) - ctx.todayDayIndex + 1;
  const shortfall = Math.max(0, goal - done);
  const hasPenalty = Number.isFinite(params.penaltyAmount) && params.penaltyAmount > 0;
  const atRiskAmount = hasPenalty && done < goal ? params.penaltyAmount : 0;
  const imminent = hasPenalty && shortfall > 0 && daysLeftInWeek <= shortfall;
  return { week, goal, done, daysLeftInWeek, shortfall, atRiskAmount, imminent };
}

export type WeekChipState = "achieved" | "missed" | "current" | "future";
export type WeekChip = { week: number; goal: number; done: number; state: WeekChipState };

// 모든 주의 칩 — 끝난 주(elapsed)는 달성/미달, 진행 주는 current, 나머지 future.
export function buildWeekChips(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): WeekChip[] {
  const total = totalWeeks(ctx.durationDays);
  const elapsed = new Set(elapsedWeeks(ctx));
  const currentWeek = ctx.phase === "running" ? weekIndexOf(ctx.todayDayIndex) : null;
  const chips: WeekChip[] = [];
  for (let w = 1; w <= total; w++) {
    const goal = weekGoal(w, total, params.goalCount, ctx.durationDays);
    const done = doneByWeek.get(w) ?? 0;
    let state: WeekChipState;
    if (elapsed.has(w)) state = done >= goal ? "achieved" : "missed";
    else if (w === currentWeek) state = "current";
    else state = "future";
    chips.push({ week: w, goal, done, state });
  }
  return chips;
}
```

- [ ] **Step 20: 전체 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/challenge/weekly.spec.ts
```

Expected: 모든 describe PASS.

- [ ] **Step 21: 커밋**

```bash
git add src/lib/challenge/weekly.ts src/lib/challenge/weekly.spec.ts
git commit -m "feat(challenge): weekly.ts 주 단위 벌금 누적 코어 로직 + 테스트"
```

---

## Task 3: challenge-detail.ts read 주 단위 전환

`fetchChallengeDetail`이 주차 집계로 `potTotal`을 산출하고, 멤버별 `doneByWeek`와 `closedAt`을 내려보낸다. React `cache()`라 요청 범위 — `now`를 내부에서 잡아도 stale 없음.

**Files:**

- Modify: `src/lib/db/reads/challenge-detail.ts`

- [ ] **Step 1: import 교체 + 타입 확장**

`src/lib/db/reads/challenge-detail.ts` 상단 import를 교체한다. 기존:

```ts
import { cache } from "react";
import { countDoneDaysByUser } from "@/lib/challenge/done-days";
import { computeAccruedPot } from "@/lib/challenge/settlement";
import { createClient } from "@/lib/supabase/server";
```

다음으로:

```ts
import { cache } from "react";
import { toKstDayKey, dayIndexOf } from "@/lib/challenge/done-days";
import { challengePhase } from "@/lib/challenge/lifecycle";
import {
  countDoneDaysByUserByWeek,
  computeAccruedPot,
  type CutoffContext,
  type CutoffPhase,
} from "@/lib/challenge/weekly";
import { createClient } from "@/lib/supabase/server";
```

`ChallengeMemberView` 타입에 `doneByWeek`를 추가한다. 기존:

```ts
export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
};
```

다음으로:

```ts
export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
  // 주차별 done (week → distinct day count). dashboard H3 viewer 칩·링 계산용 (서버 전용).
  doneByWeek: ReadonlyMap<number, number>;
};
```

`ChallengeDetailView`에 `closedAt`을 추가한다. 기존 `endAt: string | null;` 줄 다음에:

```ts
endAt: string | null;
// 조기 종료 cutoff 산정용 (ADR-0030). 미종료/레거시는 null.
closedAt: string | null;
```

- [ ] **Step 2: SELECT 에 closed_at 추가**

`.from("challenges").select(...)`의 컬럼 문자열에 `closed_at`을 추가한다. 기존:

```ts
        "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, group_id, groups!inner(id, owner_id, bank_code, account_holder, account_number_last4)",
```

다음으로:

```ts
        "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, group_id, groups!inner(id, owner_id, bank_code, account_holder, account_number_last4)",
```

- [ ] **Step 3: 집계·potTotal 주 단위로 교체**

기존 `const counts = countDoneDaysByUser(logs ?? []);` 부터 `members` 매핑, `const status = ...` 까지를 교체한다. 기존 블록:

```ts
// 하루 N개 피드도 인증은 1회 — KST 자정 기준 distinct day count.
const counts = countDoneDaysByUser(logs ?? []);

const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
  const u = Array.isArray(p.users) ? p.users[0] : p.users;
  return {
    id: p.user_id,
    displayName: u?.display_name ?? "익명",
    doneCount: counts.get(p.user_id) ?? 0,
    signed: p.signed_at != null,
  };
});

const status = c.status as ChallengeDetailView["status"];
```

다음으로:

```ts
const status = c.status as ChallengeDetailView["status"];
const startKey = c.start_at ? toKstDayKey(c.start_at) : null;
// 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. startKey 없으면(미시작) 빈 집계.
const byUserByWeek = startKey
  ? countDoneDaysByUserByWeek(logs ?? [], startKey, c.duration_days)
  : new Map<string, Map<number, number>>();

const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
  const u = Array.isArray(p.users) ? p.users[0] : p.users;
  const doneByWeek = byUserByWeek.get(p.user_id) ?? new Map<number, number>();
  // doneCount = 전체 distinct day (주차 합). 멤버 strip 표시용 — 기존 의미 유지.
  let doneCount = 0;
  for (const n of doneByWeek.values()) doneCount += n;
  return {
    id: p.user_id,
    displayName: u?.display_name ?? "익명",
    doneCount,
    signed: p.signed_at != null,
    doneByWeek,
  };
});

// 시간 의존: render 시점 now 1회. React cache() 라 요청마다 새로 실행 → stale 없음.
const now = new Date();
const phase = challengePhase(status, c.end_at, now.getTime());
// 주차 인덱싱이 가능한(시작된) 챌린지만 confirmed 합산. pending/accepted(start_at null)은 0.
const settleable = phase === "running" || phase === "over" || phase === "closed";
const potTotal =
  settleable && startKey
    ? computeAccruedPot(
        members.map((m) => ({ doneByWeek: m.doneByWeek })),
        {
          phase: phase as CutoffPhase,
          durationDays: c.duration_days,
          todayDayIndex: dayIndexOf(toKstDayKey(now), startKey),
          closedAt: c.closed_at ?? null,
          startKey,
        } satisfies CutoffContext,
        { goalCount: c.goal_count, penaltyAmount: c.penalty_amount },
      )
    : 0;
```

- [ ] **Step 4: 반환 객체에서 potTotal 중복 제거 + closedAt 추가**

기존 반환 객체의 `potTotal: computeAccruedPot({...})` 블록을 위에서 계산한 `potTotal` 변수로 바꾸고 `closedAt`을 추가한다. 기존:

```ts
      startAt: c.start_at,
      endAt: c.end_at,
      members,
      // 미달자 기준 실제 정산액 합계. 미시작(pending/accepted)은 0.
      potTotal: computeAccruedPot({
        status,
        goalCount: c.goal_count,
        penaltyAmount: c.penalty_amount,
        members,
      }),
      participantCount: members.length,
```

다음으로:

```ts
      startAt: c.start_at,
      endAt: c.end_at,
      closedAt: c.closed_at ?? null,
      members,
      // 끝난 주 기준 per-head 합(단조). 미시작은 0. (spec C4)
      potTotal,
      participantCount: members.length,
```

- [ ] **Step 5: typecheck**

```bash
pnpm typecheck
```

Expected: PASS (이 파일 기준. settlement.ts 는 아직 존재하므로 다른 파일 에러 없음).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/reads/challenge-detail.ts
git commit -m "feat(challenge): challenge-detail 주 단위 potTotal + doneByWeek·closedAt"
```

---

## Task 4: current-challenges.ts read 주 단위 전환

홈 피드용 read. 주 단위 `potTotal`과 viewer 본인의 `myConfirmedPenalty`를 산출한다. `cacheLife("minutes")`라 `now` baking의 한계를 주석에 명시한다.

> **spec Impact 와의 차이(의도적)**: spec Impact Scope 는 두 read(`challenge-detail`·`current-challenges`) 모두에 "현재 주 상태 필드 추가"를 적었다. 그러나 **현재 주 위험(링)은 현황판 전용**이고 홈은 표시하지 않으므로, `current-challenges` 에는 `myConfirmedPenalty`(확정·단조)만 추가하고 `currentWeekStatus` 는 넣지 않는다. 현재 주 칩·링은 `challenge-detail` 의 `doneByWeek`(Task 3)로 dashboard page 가 계산한다(Task 12). 두 read 에 같은 시간 의존 계산을 중복 baking 하지 않는다.

**Files:**

- Modify: `src/lib/db/reads/current-challenges.ts`

- [ ] **Step 1: import 교체 + 타입 확장**

기존 import:

```ts
import { cacheLife, cacheTag } from "next/cache";
import { toKstDayKey } from "@/lib/challenge/done-days";
import {
  challengePhase,
  remainingDays,
  type ChallengePhase,
  type ChallengeStatus,
} from "@/lib/challenge/lifecycle";
import { computeAccruedPot } from "@/lib/challenge/settlement";
import { createClient } from "@/lib/supabase/server";
```

다음으로:

```ts
import { cacheLife, cacheTag } from "next/cache";
import { toKstDayKey, dayIndexOf } from "@/lib/challenge/done-days";
import {
  challengePhase,
  remainingDays,
  type ChallengePhase,
  type ChallengeStatus,
} from "@/lib/challenge/lifecycle";
import {
  weekBucketsFromDayKeys,
  computeAccruedPot,
  confirmedPenalty,
  type CutoffContext,
  type CutoffPhase,
} from "@/lib/challenge/weekly";
import { createClient } from "@/lib/supabase/server";
```

`GroupChallengeView.challenge` 타입에 `myConfirmedPenalty`를 추가한다. 기존 `potTotal: number;` 줄 다음에:

```ts
potTotal: number;
// 내 확정 벌금(끝난 주 미달 합·단조). 홈 "내 벌금" stat 용. (spec C0·C3)
myConfirmedPenalty: number;
```

`ChallengeRow` 타입에 `closed_at`을 추가한다. 기존:

```ts
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};
```

다음으로:

```ts
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
  created_at: string;
};
```

- [ ] **Step 2: SELECT 에 closed_at 추가**

기존:

```ts
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, created_at",
```

다음으로:

```ts
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, created_at",
```

- [ ] **Step 3: potTotal·myConfirmedPenalty 주 단위 계산으로 교체**

기존 `groupRows.map((g) => {...})` 안에서 `const phase = challengePhase(...)` 부터 challenge 객체 반환까지를 교체한다. 기존:

```ts
const phase = challengePhase(c.status, c.end_at);
// daysLeft 는 running 일 때만 D-N 으로 렌더된다(ADR-0027). 미시작은 duration_days 폴백.
const daysLeft = c.end_at ? remainingDays(c.end_at) : c.duration_days;
const participantIds = participantIdsByChallenge.get(c.id) ?? [];
const daysByUser = dayKeysByChallengeUser.get(c.id);
const myDayKeys = daysByUser?.get(userId);
return {
  groupId: g.id,
  groupName: g.name,
  bankCode: g.bank_code,
  accountHolder: g.account_holder,
  accountNumberLast4: g.account_number_last4,
  challenge: {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status,
    phase,
    startAt: c.start_at,
    endAt: c.end_at,
    doneCount: myDayKeys?.size ?? 0,
    daysLeft,
    // 그 챌린지의 총 누적금 — 정보탭과 동일(computeAccruedPot). 미달자 기준 실제
    // 정산액 합계이며 "인원수 × 벌금"(최대값)이 아니다. 미시작(pending/accepted)은 0.
    potTotal: computeAccruedPot({
      status: c.status,
      goalCount: c.goal_count,
      penaltyAmount: c.penalty_amount,
      members: participantIds.map((uid) => ({ doneCount: daysByUser?.get(uid)?.size ?? 0 })),
    }),
    participantCount: participantIds.length,
    userIsParticipant: myParticipantChallengeIds.has(c.id),
    verifiedToday: myDayKeys?.has(todayKstKey) ?? false,
  },
};
```

다음으로:

```ts
const phase = challengePhase(c.status, c.end_at);
// daysLeft 는 running 일 때만 D-N 으로 렌더된다(ADR-0027). 미시작은 duration_days 폴백.
const daysLeft = c.end_at ? remainingDays(c.end_at) : c.duration_days;
const participantIds = participantIdsByChallenge.get(c.id) ?? [];
const daysByUser = dayKeysByChallengeUser.get(c.id);
const myDayKeys = daysByUser?.get(userId);

// 주 단위 누적 — 끝난 주만 합산(spec C3·C4). 시작된 챌린지만.
// 주의: 이 read 는 cacheLife("minutes") 다. now baking 의 stale 은 주 경계 자정 직후
// 최대 1분(주 단위 변화)이라 무해. 장기(hours/days) cache 로 올리지 말 것.
const startKey = c.start_at ? toKstDayKey(c.start_at) : null;
const settleable = phase === "running" || phase === "over" || phase === "closed";
let potTotal = 0;
let myConfirmedPenalty = 0;
if (settleable && startKey) {
  const ctx: CutoffContext = {
    phase: phase as CutoffPhase,
    durationDays: c.duration_days,
    todayDayIndex: dayIndexOf(todayKstKey, startKey),
    closedAt: c.closed_at ?? null,
    startKey,
  };
  const params = { goalCount: c.goal_count, penaltyAmount: c.penalty_amount };
  potTotal = computeAccruedPot(
    participantIds.map((uid) => ({
      doneByWeek: weekBucketsFromDayKeys(daysByUser?.get(uid) ?? [], startKey, c.duration_days),
    })),
    ctx,
    params,
  );
  myConfirmedPenalty = confirmedPenalty(
    weekBucketsFromDayKeys(myDayKeys ?? [], startKey, c.duration_days),
    ctx,
    params,
  );
}

return {
  groupId: g.id,
  groupName: g.name,
  bankCode: g.bank_code,
  accountHolder: g.account_holder,
  accountNumberLast4: g.account_number_last4,
  challenge: {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status,
    phase,
    startAt: c.start_at,
    endAt: c.end_at,
    doneCount: myDayKeys?.size ?? 0,
    daysLeft,
    potTotal,
    myConfirmedPenalty,
    participantCount: participantIds.length,
    userIsParticipant: myParticipantChallengeIds.has(c.id),
    verifiedToday: myDayKeys?.has(todayKstKey) ?? false,
  },
};
```

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

Expected: PASS (이 파일 기준).

- [ ] **Step 5: 기존 current-challenges 테스트 실행**

```bash
pnpm test src/lib/db/reads/current-challenges.spec.ts src/lib/db/reads/current-challenges-cache.spec.ts
```

Expected: PASS. 만약 `potTotal` 단언이 깨지면, 해당 테스트의 입력(로그 created_at·start_at)이 주차 경계와 맞는지 확인하고 기대값을 주 단위 결과로 갱신한다(전원 달성=0, 미달자별 penalty 합).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/reads/current-challenges.ts
git commit -m "feat(home): current-challenges 주 단위 potTotal + myConfirmedPenalty"
```

---

## Task 5: recap.ts read 주 단위 + cutoff + 영수증 주차 표현

정산 영수증용. 주차별 평가 + `closed_at` cutoff로 조기 종료를 반영하고, 영수증(`settlement-receipt`)에 주차 요약("목표 주 N회" + "N주 중 M주 달성")을 표시한다. spec Impact Scope 가 명시한 `settlement-receipt.tsx · recap.ts — 주차별 결과 + 최종 per-head 반영`을 함께 처리한다. `buildRecapView`(export·테스트됨)의 입력·출력 계약이 바뀐다.

> **왜 영수증도 바꾸나**: 주 단위 모델에서 `goalCount`(1~7)는 "주간 빈도"다. 영수증이 28일 챌린지에 "목표 인증 3회"로 표시하면 누적 목표(주3회×4주=12회)와 어긋나 "나의 인증 8회 / 목표 3회"가 초과 달성처럼 보이는데 정산은 미달로 찍혀 영수증 내부가 모순된다. "목표 주 N회" + 주차 달성 요약으로 정정한다(사용자 결정 2026-06-02: 충실 — 주차 요약 행 추가).

**Files:**

- Modify: `src/lib/db/reads/recap.ts`
- Modify: `src/lib/db/reads/recap.spec.ts`
- Modify: `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx` (영수증에 주차 요약 props 전달 — 주석 정정은 Task 8)

- [ ] **Step 1: recap.spec.ts 를 주 단위 입력으로 갱신 (실패 테스트)**

`buildRecapView`의 participants 입력이 `done_count` → `doneByWeek`로 바뀐다. `src/lib/db/reads/recap.spec.ts` 전체를 교체한다:

```ts
// src/lib/db/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { buildRecapView } from "./recap";

describe("buildRecapView (주 단위)", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  // 7일·주3회 closed(자연 종료). closed_at >= end_at → cutoff=duration(7) → week1 전체 정산.
  const challenge = {
    id: "c1",
    title: "주 3회 헬스장",
    goal_count: 3,
    duration_days: 7,
    penalty_amount: 3000,
    status: "closed" as const,
    start_at: "2026-05-01T00:00:00Z",
    end_at: "2026-05-08T00:00:00Z",
    closed_at: "2026-05-08T00:00:00Z",
  };

  // 1주 챌린지라 모든 done 이 week1. dbw 로 week1 카운트만 지정.
  const dbw = (n: number) => new Map<number, number>(n > 0 ? [[1, n]] : []);
  const participants = [
    { user_id: "u-minji", display_name: "민지", doneByWeek: dbw(3) },
    { user_id: "u-jj", display_name: "JJ", doneByWeek: dbw(5) },
    { user_id: "u-hee", display_name: "희수", doneByWeek: dbw(1) },
  ];

  it("viewer 달성 — per-head 0원 · achieved true · 주차 요약 1주 중 1주", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerDoneCount).toBe(3);
    expect(view.viewerPerHeadPenalty).toBe(0);
    expect(view.viewerElapsedWeeks).toBe(1);
    expect(view.viewerAchievedWeeks).toBe(1);
  });

  it("viewer 미달 — penalty_amount 그대로", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-hee", now });
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerPerHeadPenalty).toBe(3000);
  });

  it("MVP 는 단독 1위 JJ (끝난 주 달성자 중 총 인증일 최다)", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    const mvpIds = view.members.filter((m) => m.isMvp).map((m) => m.id);
    expect(mvpIds).toEqual(["u-jj"]);
    expect(view.anyoneAchieved).toBe(true);
  });

  it("전원 미달 → anyoneAchieved=false · MVP 0명", () => {
    const view = buildRecapView({
      challenge,
      participants: participants.map((p) => ({ ...p, doneByWeek: dbw(1) })),
      viewerId: "u-minji",
      now,
    });
    expect(view.anyoneAchieved).toBe(false);
    expect(view.members.every((m) => m.isMvp === false)).toBe(true);
  });

  it("over(active+만기): status='active' 그대로 반환, cutoff=duration", () => {
    const view = buildRecapView({
      challenge: { ...challenge, status: "active", closed_at: null },
      participants,
      viewerId: "u-minji",
      now,
    });
    expect(view.status).toBe("active");
    expect(view.viewerPerHeadPenalty).toBe(0); // 민지 week1 달성
  });

  it("조기 종료: 28일·주3회를 day10 종료 → 1주차만 정산", () => {
    const early = {
      ...challenge,
      duration_days: 28,
      end_at: "2026-05-29T00:00:00Z",
      closed_at: "2026-05-10T01:00:00Z",
    };
    // 민지: week1 미달(1회). week2~4 는 미발생/중도 → 미부과. → penalty 1회분만.
    const view = buildRecapView({
      challenge: early,
      participants: [{ user_id: "u-minji", display_name: "민지", doneByWeek: new Map([[1, 1]]) }],
      viewerId: "u-minji",
      now,
    });
    expect(view.viewerPerHeadPenalty).toBe(3000);
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerElapsedWeeks).toBe(1); // day10 cutoff → week1 만 끝남
    expect(view.viewerAchievedWeeks).toBe(0); // week1 미달
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/db/reads/recap.spec.ts
```

Expected: FAIL — participants 타입 불일치(`done_count` 없음) / `closed_at` 미지원.

- [ ] **Step 3: recap.ts import·타입 교체**

기존 import:

```ts
import { countDoneDaysByUser } from "@/lib/challenge/done-days";
import { computePerHeadPenalty, pickMvpIds } from "@/lib/challenge/settlement";
```

다음으로:

```ts
import { toKstDayKey } from "@/lib/challenge/done-days";
import {
  countDoneDaysByUserByWeek,
  confirmedPenalty,
  achievedAllElapsedWeeks,
  doneInElapsedWeeks,
  countAchievedWeeks,
  elapsedWeeks,
  pickMvpIds,
  type CutoffContext,
} from "@/lib/challenge/weekly";
```

`RecapView` 타입에 주차 요약 필드를 추가한다(영수증 표시용). 기존:

```ts
viewerPerHeadPenalty: number;
// PRD §10 / 모킹업 §11 — 정산 시점 그룹 계좌 lazy prompt 에 필요.
group: RecapGroupView | null;
```

다음으로:

```ts
viewerPerHeadPenalty: number;
// 영수증 주차 요약 — viewer 기준. cutoff 안에 끝난 주 수 / 그중 달성한 주 수.
viewerElapsedWeeks: number;
viewerAchievedWeeks: number;
// PRD §10 / 모킹업 §11 — 정산 시점 그룹 계좌 lazy prompt 에 필요.
group: RecapGroupView | null;
```

`ChallengeRow` 타입에 `closed_at`을 추가한다. 기존:

```ts
  start_at: string | null;
  end_at: string | null;
};
```

다음으로:

```ts
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
};
```

`ParticipantRow` 타입을 교체한다. 기존:

```ts
type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  done_count: number;
};
```

다음으로:

```ts
type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  doneByWeek: Map<number, number>;
};
```

- [ ] **Step 4: buildRecapView 본문 주 단위로 교체**

기존 `buildRecapView` 함수 전체(`export function buildRecapView(input: {` 부터 닫는 `}` 까지)를 교체한다:

```ts
export function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: ReadonlyArray<ParticipantRow>;
  viewerId: string;
  now: Date;
  group?: RecapGroupView | null;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  // recap 진입 조건은 isChallengeOver — closed 또는 active+만기(over). running 미진입.
  const phase = challenge.status === "closed" ? "closed" : "over";
  const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : "";
  const ctx: CutoffContext = {
    phase,
    durationDays: challenge.duration_days,
    todayDayIndex: 0, // over/closed 는 today 비의존
    closedAt: challenge.closed_at,
    startKey,
  };
  const params = { goalCount: challenge.goal_count, penaltyAmount: challenge.penalty_amount };

  const mvpIds = pickMvpIds(
    participants.map((p) => ({ id: p.user_id, doneByWeek: p.doneByWeek })),
    ctx,
    { goalCount: challenge.goal_count },
  );

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: doneInElapsedWeeks(p.doneByWeek, ctx),
    achieved: achievedAllElapsedWeeks(p.doneByWeek, ctx, { goalCount: challenge.goal_count }),
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewerPart = participants.find((p) => p.user_id === viewerId);
  const viewerDoneByWeek = viewerPart?.doneByWeek ?? new Map<number, number>();

  return {
    challengeId: challenge.id,
    title: challenge.title,
    goalCount: challenge.goal_count,
    durationDays: challenge.duration_days,
    penaltyAmount: challenge.penalty_amount,
    startAt: challenge.start_at,
    endAt: challenge.end_at,
    status: challenge.status,
    viewerId,
    viewerAchieved: achievedAllElapsedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    viewerDoneCount: doneInElapsedWeeks(viewerDoneByWeek, ctx),
    viewerPerHeadPenalty: confirmedPenalty(viewerDoneByWeek, ctx, params),
    viewerElapsedWeeks: elapsedWeeks(ctx).length,
    viewerAchievedWeeks: countAchievedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    group: input.group ?? null,
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
}
```

- [ ] **Step 5: fetchRecap 의 SELECT·집계 교체**

`fetchRecap` 안에서 challenge SELECT 컬럼에 `closed_at`을 추가한다. 기존:

```ts
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, groups!inner(id, name, owner_id, bank_code, account_holder, account_number_last4)",
```

다음으로:

```ts
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, groups!inner(id, name, owner_id, bank_code, account_holder, account_number_last4)",
```

`ChallengeRow` 구성 객체에 `closed_at`을 추가한다. 기존:

```ts
    start_at: raw.start_at as string | null,
    end_at: raw.end_at as string | null,
  };
```

다음으로:

```ts
    start_at: raw.start_at as string | null,
    end_at: raw.end_at as string | null,
    closed_at: raw.closed_at as string | null,
  };
```

participants 집계를 주차 버킷으로 교체한다. 기존:

```ts
// 하루 N개 피드도 인증은 1회 — KST 자정 기준 distinct day count.
const doneByUser = countDoneDaysByUser(logs ?? []);

const participants: ParticipantRow[] = (parts ?? []).map((p) => {
  const u = Array.isArray(p.users) ? p.users[0] : p.users;
  return {
    user_id: p.user_id,
    display_name: u?.display_name ?? null,
    done_count: doneByUser.get(p.user_id) ?? 0,
  };
});
```

다음으로:

```ts
// 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. start_at 없으면 빈 집계.
const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : null;
const byUserByWeek = startKey
  ? countDoneDaysByUserByWeek(logs ?? [], startKey, challenge.duration_days)
  : new Map<string, Map<number, number>>();

const participants: ParticipantRow[] = (parts ?? []).map((p) => {
  const u = Array.isArray(p.users) ? p.users[0] : p.users;
  return {
    user_id: p.user_id,
    display_name: u?.display_name ?? null,
    doneByWeek: byUserByWeek.get(p.user_id) ?? new Map<number, number>(),
  };
});
```

> 주의: 이제 `countDoneDaysByUser`는 `recap.ts`에서 쓰지 않으므로 Step 3에서 import 라인을 `import { toKstDayKey } from "@/lib/challenge/done-days";`로 이미 바꿨다. 잔존 참조가 없는지 확인한다.

- [ ] **Step 6: 테스트 실행 — 통과 확인**

```bash
pnpm test src/lib/db/reads/recap.spec.ts
```

Expected: PASS.

- [ ] **Step 7: typecheck**

```bash
pnpm typecheck
```

Expected: PASS (이 파일 기준).

- [ ] **Step 8: 커밋 (recap.ts)**

```bash
git add src/lib/db/reads/recap.ts src/lib/db/reads/recap.spec.ts
git commit -m "feat(recap): buildRecapView 주 단위 + closed_at cutoff 재정의"
```

- [ ] **Step 9: settlement-receipt.spec.tsx 갱신 (실패 테스트)**

기존 테스트 데이터는 `goalCount: 12`인데, 주 단위 모델에서 `goalCountLabel`은 1~7만 허용해 RangeError가 난다. `goalCount`를 1~7로 바꾸고 주차 요약 props·단언을 추가한다. `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx`의 `base`와 첫 두 테스트를 교체한다.

`base` 객체 교체. 기존:

```tsx
const base = {
  title: "아침 루틴",
  durationDays: 12,
  startAt: "2026-05-01T00:00:00Z",
  endAt: "2026-05-12T00:00:00Z",
  goalCount: 12,
  members: [
    { id: "a", displayName: "민지", isMvp: true },
    { id: "b", displayName: "현우", isMvp: false },
  ],
};
```

다음으로:

```tsx
const base = {
  title: "아침 루틴",
  durationDays: 12, // 2주(주1: 7일·주2: 자투리 5일)
  startAt: "2026-05-01T00:00:00Z",
  endAt: "2026-05-12T00:00:00Z",
  goalCount: 3, // 주 단위 빈도 (1~7)
  elapsedWeeks: 2,
  achievedWeeks: 1,
  members: [
    { id: "a", displayName: "민지", isMvp: true },
    { id: "b", displayName: "현우", isMvp: false },
  ],
};
```

첫 테스트("그룹 미달")의 단언을 교체한다. 기존:

```tsx
expect(screen.getByText(/우리 그룹/)).toBeTruthy();
expect(screen.getByText("12회")).toBeTruthy(); // 목표 인증
expect(screen.getByText("9회")).toBeTruthy(); // 나의 인증
expect(screen.getByText(/미달/)).toBeTruthy();
```

다음으로:

```tsx
expect(screen.getByText(/우리 그룹/)).toBeTruthy();
expect(screen.getByText("주 3회")).toBeTruthy(); // 목표 (주간 빈도)
expect(screen.getByText("2주 중 1주")).toBeTruthy(); // 주차 달성
expect(screen.getByText("9회")).toBeTruthy(); // 나의 인증
expect(screen.getByText(/미달/)).toBeTruthy();
```

> 솔로 테스트("솔로: CREW·ACCOUNT 미렌더")는 props 를 펼치지 않고 직접 나열하므로, 그 `render(...)` 호출에 `elapsedWeeks={2}` `achievedWeeks={2}` `goalCount={3}` 를 추가하고 `durationDays={12}` 는 유지한다(이 테스트는 주차 텍스트를 단언하지 않으므로 값만 유효하면 됨).

- [ ] **Step 10: 테스트 실행 — 실패 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx"
```

Expected: FAIL — `elapsedWeeks`/`achievedWeeks` prop 미지원, "주 3회"/"2주 중 1주" 미렌더.

- [ ] **Step 11: settlement-receipt.tsx 주차 표현 추가**

`src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` 상단 import에 헬퍼를 추가한다. 기존:

```tsx
import { formatKRW } from "@/lib/challenge/penalty";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
```

다음으로:

```tsx
import { formatKRW } from "@/lib/challenge/penalty";
import { goalCountLabel } from "@/lib/challenge/frequency";
import { totalWeeks } from "@/lib/challenge/weekly";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
```

`Props` 타입에 주차 요약을 추가한다. 기존:

```tsx
goalCount: number;
viewerDoneCount: number;
```

다음으로:

```tsx
goalCount: number;
// 주차 요약 (recap.viewerElapsedWeeks · viewerAchievedWeeks). 2주 이상일 때만 표시.
elapsedWeeks: number;
achievedWeeks: number;
viewerDoneCount: number;
```

함수 구조분해 인자에 추가한다. 기존:

```tsx
  goalCount,
  viewerDoneCount,
```

다음으로:

```tsx
  goalCount,
  elapsedWeeks,
  achievedWeeks,
  viewerDoneCount,
```

`dl` 항목을 교체한다. 기존:

```tsx
<dl className="text-[13px] leading-[2]">
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">목표 인증</dt>
    <dd className="font-semibold">{goalCount}회</dd>
  </div>
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">나의 인증</dt>
    <dd className="font-semibold">{viewerDoneCount}회</dd>
  </div>
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">판정</dt>
    <dd className="font-semibold">{viewerAchieved ? "달성 🎉" : "미달 😅"}</dd>
  </div>
</dl>
```

다음으로:

```tsx
<dl className="text-[13px] leading-[2]">
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">목표</dt>
    <dd className="font-semibold">{goalCountLabel(goalCount).detail}</dd>
  </div>
  {totalWeeks(durationDays) > 1 && (
    <div className="flex justify-between">
      <dt className="text-[var(--invite-muted)]">주차 달성</dt>
      <dd className="font-semibold tabular-nums">
        {elapsedWeeks}주 중 {achievedWeeks}주
      </dd>
    </div>
  )}
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">나의 인증</dt>
    <dd className="font-semibold">{viewerDoneCount}회</dd>
  </div>
  <div className="flex justify-between">
    <dt className="text-[var(--invite-muted)]">판정</dt>
    <dd className="font-semibold">{viewerAchieved ? "달성 🎉" : "미달 😅"}</dd>
  </div>
</dl>
```

> `goalCountLabel(goalCount).detail`은 "주 3회" 또는 "매일 1회"(goalCount 7)를 반환한다. `totalWeeks(durationDays) > 1` 조건으로 1주 챌린지(7일 이하)에서는 "1주 중 1주" 같은 무의미한 행을 숨긴다.

- [ ] **Step 12: recap/page.tsx 가 주차 요약 props 전달**

`src/app/(app)/challenge/[id]/recap/page.tsx`의 `<SettlementReceipt ... />`에 props를 추가한다. 기존:

```tsx
        goalCount={recap.goalCount}
        viewerDoneCount={recap.viewerDoneCount}
```

다음으로:

```tsx
        goalCount={recap.goalCount}
        elapsedWeeks={recap.viewerElapsedWeeks}
        achievedWeeks={recap.viewerAchievedWeeks}
        viewerDoneCount={recap.viewerDoneCount}
```

- [ ] **Step 13: 테스트 통과 + typecheck**

```bash
pnpm test "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx"
```

```bash
pnpm typecheck
```

Expected: 둘 다 PASS.

- [ ] **Step 14: 커밋 (영수증)**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx" "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx" "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "feat(recap): 정산 영수증 주차 요약(목표 주N회·N주 중 M주 달성)"
```

---

## Task 6: settlement.ts 삭제 + 호출처(home·info 라벨) 정리

`settlement.ts`의 3개 함수는 모두 `weekly.ts`로 흡수됐다. 마지막 호출처(home)를 교체하고 파일을 삭제한다.

**Files:**

- Modify: `src/app/(app)/home/page.tsx`
- Modify: `src/app/(app)/home/_components/stats-grid.tsx`
- Modify: `src/app/(app)/home/_components/running-challenge-list.tsx`
- Modify: `src/app/(app)/home/_components/settlement-pending-list.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/info-tab.tsx`
- Delete: `src/lib/challenge/settlement.ts`
- Delete: `src/lib/challenge/settlement.spec.ts`

- [ ] **Step 1: home/page.tsx — myConfirmedPenalty 합산으로 교체**

기존 import 줄을 삭제한다:

```ts
import { computePerHeadPenalty } from "@/lib/challenge/settlement";
```

`stats` 객체의 `totalPenalty` 계산을 교체한다. 기존:

```ts
    // 홈 stat = "내 예정 벌금" — 주간 goal 미달성 시 내가 낼 노출액(그룹 pot 아님).
    // recap 과 동일한 computePerHeadPenalty 로 산정해 홈↔정산 일관성 유지.
    totalPenalty: activeChallenges.reduce(
      (sum, c) =>
        sum +
        computePerHeadPenalty({
          doneCount: c.doneCount,
          goalCount: c.goalCount,
          penaltyAmount: c.penaltyAmount,
        }),
      0,
    ),
```

다음으로:

```ts
    // 홈 stat = "내 벌금" — 끝난 주 미달 합(확정·단조). current-challenges 가 주 단위로 산정.
    // 인증해도 즉시 0으로 안 떨어진다(현재 주 위험은 현황판 링이 담당 — spec C0).
    totalPenalty: activeChallenges.reduce((sum, c) => sum + c.myConfirmedPenalty, 0),
```

- [ ] **Step 2: stats-grid.tsx — 라벨 "예정 벌금" → "내 벌금"**

기존:

```tsx
<StatCell tone="muted" value={penalty.number} unit={penalty.unit} label="예정 벌금" />
```

다음으로:

```tsx
<StatCell tone="muted" value={penalty.number} unit={penalty.unit} label="내 벌금" />
```

상단 주석 2줄도 라벨에 맞춰 정정한다. 기존:

```tsx
// 모킹업 §2-B `stats4` — 4 stats (진행중·오늘완료·미인증·예정벌금).
// 컬러 시멘틱: primary(active) · success(완료) · warn(미인증) · gray(내 예정 벌금).
```

다음으로:

```tsx
// 모킹업 §2-B `stats4` — 4 stats (진행중·오늘완료·미인증·내 벌금).
// 컬러 시멘틱: primary(active) · success(완료) · warn(미인증) · gray(내 벌금·확정 누적).
```

- [ ] **Step 3: 그룹 확정 벌금 라벨을 "모인 벌금"으로 전체 통일**

같은 그룹 확정값(`potTotal`)이 화면마다 "누적 벌금"·"모인 예정 벌금"으로 갈리던 것을 **"모인 벌금"으로 통일**한다(사용자 결정 2026-06-02 — spec Why "라벨 혼재" 해소). 현황판(dashboard-tab)은 Task 11에서 함께 "모인 벌금"으로 맞춘다.

`src/app/(app)/challenge/[id]/_components/info-tab.tsx` — 기존:

```tsx
<InfoRow label="모인 예정 벌금" value={formatKRW(detail.potTotal)} />
```

다음으로:

```tsx
<InfoRow label="모인 벌금" value={formatKRW(detail.potTotal)} />
```

`src/app/(app)/home/_components/running-challenge-list.tsx` — 기존:

```tsx
<span className="tabular-nums">누적 벌금 {formatKRW(potTotal)}</span>
```

다음으로:

```tsx
<span className="tabular-nums">모인 벌금 {formatKRW(potTotal)}</span>
```

같은 파일 상단 주석도 정정한다. 기존 `// 각 row: 컬러 썸네일 + 제목 + meta(인원·오늘상태·누적 벌금) + D-N.` → `... meta(인원·오늘상태·모인 벌금) + D-N.`

`src/app/(app)/home/_components/settlement-pending-list.tsx` — 기존:

```tsx
<span className="tabular-nums">누적 벌금 {formatKRW(c.potTotal)}</span>
```

다음으로:

```tsx
<span className="tabular-nums">모인 벌금 {formatKRW(c.potTotal)}</span>
```

> `running-challenge-list.spec.tsx` · `settlement-pending-list.spec.tsx` 는 "누적 벌금" 텍스트를 단언하지 않으므로(확인됨) 무변경. 만약 단언이 있으면 "모인 벌금"으로 갱신한다.

- [ ] **Step 4: settlement.ts·spec 삭제**

```bash
git rm src/lib/challenge/settlement.ts src/lib/challenge/settlement.spec.ts
```

- [ ] **Step 5: 잔존 참조 없음 확인**

```bash
grep -rn "challenge/settlement\|computePerHeadPenalty" src/
```

Expected: 출력 없음(0 매치). 매치가 있으면 그 파일을 `weekly.ts`로 교체한다.

- [ ] **Step 6: typecheck + 전체 테스트**

```bash
pnpm typecheck
```

```bash
pnpm test
```

Expected: PASS. `settlement.spec.ts`가 사라졌고 회귀 동등성은 `weekly.spec.ts`(Task 2 Step 13의 1주 회귀 테스트)가 커버한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "refactor(challenge): settlement.ts 삭제·weekly.ts 일원화 + 홈/정보 라벨 정정"
```

---

## Task 7: 종료 경로가 closed_at set (action + cron)

`status='closed'` 전이 두 경로가 `closed_at = now()`를 함께 set 한다.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/_actions.ts`
- Modify: `src/app/api/cron/deadline-push/route.ts`
- Modify: `src/app/api/cron/deadline-push/route.spec.ts`

- [ ] **Step 1: endChallenge 가 closed_at set**

`src/app/(app)/challenge/[id]/_actions.ts`의 `endChallenge` 안 update를 교체한다. 기존:

```ts
const admin = adminClient();
const { error } = await admin
  .from("challenges")
  .update({ status: "closed" })
  .eq("id", parsed.data.challengeId);
```

다음으로:

```ts
const admin = adminClient();
// ADR-0030 — 조기 종료 cutoff 산정용으로 종료 시각도 함께 기록.
const { error } = await admin
  .from("challenges")
  .update({ status: "closed", closed_at: new Date().toISOString() })
  .eq("id", parsed.data.challengeId);
```

- [ ] **Step 2: auto-close cron 이 closed_at set**

`src/app/api/cron/deadline-push/route.ts`의 auto-close update를 교체한다. 기존:

```ts
const { data: closedRows, error: closeErr } = await admin
  .from("challenges")
  .update({ status: "closed" })
  .eq("status", "active")
  .lte("end_at", new Date(now).toISOString())
  .select("id");
```

다음으로:

```ts
// ADR-0030 — 자연 종료(만기)도 closed_at 기록. closed_at >= end_at 이라 cutoff=duration 으로 수렴.
const { data: closedRows, error: closeErr } = await admin
  .from("challenges")
  .update({ status: "closed", closed_at: new Date(now).toISOString() })
  .eq("status", "active")
  .lte("end_at", new Date(now).toISOString())
  .select("id");
```

- [ ] **Step 3: cron 테스트 — closed_at 검증 추가**

`src/app/api/cron/deadline-push/route.spec.ts`의 `challengesChain`은 `.update()`의 인자를 검사하지 않는다. update payload를 캡처해 `closed_at` 포함을 검증한다.

파일 상단 mock 영역에 캡처 변수를 추가한다. 기존:

```ts
const dispatchedMap: Record<string, boolean> = {};
```

다음으로:

```ts
const dispatchedMap: Record<string, boolean> = {};
let lastUpdatePayload: Record<string, unknown> | null = null;
```

`challengesChain`의 `chain.update`를 교체한다. 기존:

```ts
chain.update = () => {
  chain.__isUpdate = true;
  return chain;
};
```

다음으로:

```ts
chain.update = (payload: Record<string, unknown>) => {
  chain.__isUpdate = true;
  lastUpdatePayload = payload;
  return chain;
};
```

`beforeEach`에 리셋을 추가한다. 기존 `closePlan.error = undefined;` 줄 다음에:

```ts
lastUpdatePayload = null;
```

auto-close describe에 검증 테스트를 추가한다(기존 "closes expired active challenges..." it 블록 다음에):

```ts
it("auto-close 시 closed_at 을 함께 set (ADR-0030)", async () => {
  closePlan.rows = [{ id: "expired-1" }];
  await POST(req("Bearer supersecret"));
  expect(lastUpdatePayload).toMatchObject({ status: "closed" });
  expect(typeof lastUpdatePayload?.closed_at).toBe("string");
});
```

- [ ] **Step 4: cron 테스트 실행**

```bash
pnpm test src/app/api/cron/deadline-push/route.spec.ts
```

Expected: PASS(신규 테스트 포함).

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_actions.ts" src/app/api/cron/deadline-push/route.ts src/app/api/cron/deadline-push/route.spec.ts
git commit -m "feat(challenge): 종료 경로(endChallenge·auto-close)가 closed_at set (ADR-0030)"
```

---

## Task 8: recap/page.tsx 주석 정정

검토 중 발견: `recap/page.tsx`의 주석이 "status='closed' 는 endChallenge action 만 작성 (auto-close 없음)"이라 하는데, 실제로는 `deadline-push` cron이 auto-close 한다. cutoff 도입으로 정합성이 바뀌었으니 주석을 정정한다. `isEarlyEnded` 판정(`status='closed' AND end_at > now`)은 그대로 유효하다(auto-close는 `end_at <= now`에서만 발생하므로).

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`

- [ ] **Step 1: 주석 교체**

기존:

```tsx
// 조기 종료 = status='closed' AND end_at 가 아직 미래.
// status='closed' 는 endChallenge action 만 작성 (auto-close 없음) → 운영자가 명시적으로 종료 누름.
// end_at 미래면 만기 도달 전 종료 = 조기. 만기 도달 후 종료면 그냥 정상 종료로 본다.
const isEarlyEnded =
  recap.status === "closed" && recap.endAt != null && new Date(recap.endAt) > new Date();
```

다음으로:

```tsx
// 조기 종료 = status='closed' AND end_at 가 아직 미래.
// status='closed' 는 endChallenge action(수동) 또는 auto-close cron(만기, end_at<=now) 이 작성.
// auto-close 는 end_at<=now 에서만 일어나므로, end_at 미래 + closed = 운영자 수동 조기 종료가 확실.
// 정산 금액 cutoff 는 challenges.closed_at(ADR-0030)을 recap.ts 가 이미 반영한다.
const isEarlyEnded =
  recap.status === "closed" && recap.endAt != null && new Date(recap.endAt) > new Date();
```

- [ ] **Step 2: typecheck + 커밋**

```bash
pnpm typecheck
```

```bash
git add "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "docs(recap): isEarlyEnded 주석을 auto-close 현실에 맞게 정정"
```

---

## Task 9: week-chips 컴포넌트 (TDD)

주차별 기록 칩(H3 주인공). viewer 개인 주차 상태를 칩으로 렌더한다. 서버 컴포넌트(인터랙션 없음).

**Files:**

- Create: `src/app/(app)/challenge/[id]/_components/week-chips.tsx`
- Test: `src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekChips } from "./week-chips";
import type { WeekChip } from "@/lib/challenge/weekly";

const chips: WeekChip[] = [
  { week: 1, goal: 3, done: 3, state: "achieved" },
  { week: 2, goal: 3, done: 1, state: "missed" },
  { week: 3, goal: 3, done: 1, state: "current" },
  { week: 4, goal: 3, done: 0, state: "future" },
];

describe("WeekChips", () => {
  it("각 주차의 N/목표 텍스트를 렌더", () => {
    render(<WeekChips weeks={chips} />);
    expect(screen.getByText("1주 3/3")).toBeTruthy();
    expect(screen.getByText("2주 1/3")).toBeTruthy();
    expect(screen.getByText("4주 0/3")).toBeTruthy();
  });

  it("주차별 기록 aria-label 리스트", () => {
    render(<WeekChips weeks={chips} />);
    expect(screen.getByLabelText("주차별 기록")).toBeTruthy();
  });

  it("빈 배열이면 아무 칩도 렌더 안 함", () => {
    const { container } = render(<WeekChips weeks={[]} />);
    expect(container.querySelectorAll("li").length).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx"
```

Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: week-chips.tsx 구현**

`src/app/(app)/challenge/[id]/_components/week-chips.tsx`:

```tsx
// spec C6 — 주차별 기록 칩(H3 주인공). viewer 개인 주차 상태.
// 달성(primary-soft) · 미달(warn 틴트) · 현재 주(점선) · 미래 주(중립).
import { cn } from "@/lib/utils";
import type { WeekChip } from "@/lib/challenge/weekly";

const STATE_CLASS: Record<WeekChip["state"], string> = {
  achieved: "border-primary/20 bg-primary/10 text-primary",
  missed: "border-brand-warn/20 bg-brand-warn/10 text-brand-warn",
  current: "border-dashed border-primary/40 text-foreground",
  future: "border-transparent bg-muted text-muted-foreground",
};

export function WeekChips({ weeks }: { weeks: ReadonlyArray<WeekChip> }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="주차별 기록">
      {weeks.map((c) => (
        <li
          key={c.week}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums",
            STATE_CLASS[c.state],
          )}
        >
          {c.week}주 {c.done}/{c.goal}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx"
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_components/week-chips.tsx" "src/app/(app)/challenge/[id]/_components/week-chips.spec.tsx"
git commit -m "feat(challenge): week-chips 주차 기록 칩 컴포넌트"
```

---

## Task 10: week-ring 컴포넌트 (TDD)

이번 주 진척 링 + 동적 카피. `currentWeekStatus`를 받아 게이지와 "N번 더 채우면 추가 벌금 0원"(긍정), `imminent`이면 "이대로면 +N원"을 표시한다. 서버 컴포넌트.

> **spec Rollout 6 "헤더 D-day vs 이번 주 마감 문구 구분"에 대한 결정**: spec 은 마지막 주에서 `daysLeftInWeek == remainingDays(end_at)` 라 헤더 D-day 와 링이 같은 값을 보일 수 있어 "전체 D-N vs 이번 주 마감" 라벨 구분을 요구한다. 본 plan 의 링은 **남은 일수를 숫자로 표시하지 않고** 행동 카피("N번 더 채우면…")와 imminent 시 금액만 보여주므로 헤더 D-day 와의 중복 인지가 애초에 발생하지 않는다(의도적 단순화). "이번 주 마감 임박"은 `imminent` 분기의 "이대로면 +N원"으로 전달한다. 향후 링에 "이번 주 N일 남음"을 추가한다면 그때 라벨 구분을 도입한다.

**Files:**

- Create: `src/app/(app)/challenge/[id]/_components/week-ring.tsx`
- Test: `src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekRing } from "./week-ring";
import type { CurrentWeekStatus } from "@/lib/challenge/weekly";

const base: CurrentWeekStatus = {
  week: 2,
  goal: 3,
  done: 1,
  daysLeftInWeek: 5,
  shortfall: 2,
  atRiskAmount: 3000,
  imminent: false,
};

describe("WeekRing", () => {
  it("이번 주 done/goal 게이지 텍스트", () => {
    render(<WeekRing status={base} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText(/이번 주/)).toBeTruthy();
  });

  it("shortfall>0 평소: '2번 더 채우면 추가 벌금 0원' (동적, literal 금지)", () => {
    render(<WeekRing status={base} />);
    expect(screen.getByText("2번 더 채우면 추가 벌금 0원")).toBeTruthy();
  });

  it("달성(shortfall 0): 긍정 완료 카피, 위험 미표시", () => {
    render(<WeekRing status={{ ...base, done: 3, shortfall: 0, atRiskAmount: 0 }} />);
    expect(screen.getByText("이번 주 목표를 채웠어요")).toBeTruthy();
    expect(screen.queryByText(/이대로면/)).toBeNull();
  });

  it("imminent: '이대로면 +3,000원' 명시", () => {
    render(<WeekRing status={{ ...base, daysLeftInWeek: 2, imminent: true }} />);
    expect(screen.getByText("이대로면 +3,000원")).toBeTruthy();
  });

  it("0원 챌린지(atRiskAmount 0): imminent 라도 +원 미표시", () => {
    render(<WeekRing status={{ ...base, atRiskAmount: 0, daysLeftInWeek: 2, imminent: false }} />);
    expect(screen.queryByText(/이대로면/)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx"
```

Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: week-ring.tsx 구현**

`src/app/(app)/challenge/[id]/_components/week-ring.tsx`:

```tsx
// spec C6 — 이번 주 진척 링(작은 게이지) + 동적 카피.
// 평소: "{shortfall}번 더 채우면 추가 벌금 0원"(긍정). imminent: "이대로면 +N원" 추가.
// 카피는 동적 — literal "3번" 금지(goalCount 1~7·자투리에 따라 가변).
import { formatKRW } from "@/lib/challenge/penalty";
import type { CurrentWeekStatus } from "@/lib/challenge/weekly";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function WeekRing({ status }: { status: CurrentWeekStatus }) {
  const pct = status.goal > 0 ? Math.min(1, status.done / status.goal) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const headline =
    status.shortfall > 0
      ? `${status.shortfall}번 더 채우면 추가 벌금 0원`
      : "이번 주 목표를 채웠어요";

  return (
    <div className="flex items-center gap-4 rounded-[14px] border p-4">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <circle cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 32 32)"
          className="stroke-primary transition-[stroke-dashoffset]"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="fill-foreground text-[14px] font-bold tabular-nums"
        >
          {status.done}/{status.goal}
        </text>
      </svg>
      <div className="flex flex-col gap-0.5">
        <p className="t-caption text-muted-foreground">이번 주 진척</p>
        <p className="t-body font-semibold break-keep">{headline}</p>
        {status.imminent && status.atRiskAmount > 0 && (
          <p className="t-caption text-brand-warn font-semibold">
            이대로면 +{formatKRW(status.atRiskAmount)}
          </p>
        )}
      </div>
    </div>
  );
}
```

> `formatKRW(3000)`은 `"3,000원"`을 반환한다(기존 `src/lib/challenge/penalty.ts`). 테스트의 `"이대로면 +3,000원"`과 일치한다. 구현 전 `penalty.ts`에서 `formatKRW`의 실제 출력 포맷을 확인하고, `"3,000원"`이 아니면 테스트 기대 문자열을 실제 포맷에 맞춘다.

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx"
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_components/week-ring.tsx" "src/app/(app)/challenge/[id]/_components/week-ring.spec.tsx"
git commit -m "feat(challenge): week-ring 이번 주 진척 링 + 동적 카피"
```

---

## Task 11: dashboard-tab H3 레이아웃 (TDD)

현황판 탭을 H3로 교체한다. 누적 금액 행 + 주차 칩 + 이번 주 링 + member-strip(유지). placeholder KPI(총 인증/실패) 제거.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx`

- [ ] **Step 1: dashboard-tab.spec.tsx 를 H3 props 로 교체 (실패 테스트)**

전체 교체:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardTab } from "./dashboard-tab";
import type { WeekChip, CurrentWeekStatus } from "@/lib/challenge/weekly";

const weeks: WeekChip[] = [
  { week: 1, goal: 3, done: 3, state: "achieved" },
  { week: 2, goal: 3, done: 1, state: "current" },
];
const currentWeek: CurrentWeekStatus = {
  week: 2,
  goal: 3,
  done: 1,
  daysLeftInWeek: 5,
  shortfall: 2,
  atRiskAmount: 3000,
  imminent: false,
};
const baseProps = {
  potTotal: 6000,
  weeks,
  currentWeek,
  daysRemaining: 15,
  phase: "running" as const,
  goalCount: 3,
  members: [
    { id: "u1", displayName: "두두", doneCount: 13, signed: true, doneByWeek: new Map() },
    { id: "u2", displayName: "민지", doneCount: 15, signed: true, doneByWeek: new Map() },
  ],
};

describe("DashboardTab (H3)", () => {
  it("누적 금액 행 '모인 벌금' + 금액", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("모인 벌금")).toBeTruthy();
    expect(screen.getByText("6,000")).toBeTruthy();
  });

  it("주차 칩 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("1주 3/3")).toBeTruthy();
    expect(screen.getByText("2주 1/3")).toBeTruthy();
  });

  it("running: 이번 주 링 카피 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("2번 더 채우면 추가 벌금 0원")).toBeTruthy();
  });

  it("over/closed: currentWeek null 이면 링 미표시", () => {
    render(<DashboardTab {...baseProps} phase="over" currentWeek={null} daysRemaining={null} />);
    expect(screen.queryByText(/이번 주 진척/)).toBeNull();
  });

  it("멤버 strip 유지 — 멤버 이름 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("두두")).toBeTruthy();
    expect(screen.getByText("민지")).toBeTruthy();
  });

  it("placeholder KPI(실패 N회) 미표시", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.queryByText(/실패/)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx"
```

Expected: FAIL — DashboardTab 의 props 시그니처 불일치.

- [ ] **Step 3: dashboard-tab.tsx 전체 교체**

```tsx
// spec C6 현황판 H3 — 누적 금액(확정·단조) + viewer 주차 칩 + 이번 주 링 + 멤버 strip(유지).
// D-day·기간은 헤더(StatusCard)에 통합돼 있어 여기서는 중복 표시하지 않는다.

import { Card } from "@/components/ui/card";
import { MemberStrip } from "./member-strip";
import { WeekChips } from "./week-chips";
import { WeekRing } from "./week-ring";
import type { ChallengePhase } from "@/lib/challenge/lifecycle";
import type { ChallengeMemberView } from "@/lib/db/reads/challenge-detail";
import type { WeekChip, CurrentWeekStatus } from "@/lib/challenge/weekly";

interface DashboardTabProps {
  potTotal: number; // 그룹 확정 누적(단조)
  weeks: ReadonlyArray<WeekChip>; // viewer 주차 칩
  currentWeek: CurrentWeekStatus | null; // viewer 이번 주(running 일 때만)
  daysRemaining: number | null;
  phase: ChallengePhase;
  goalCount: number;
  members: ReadonlyArray<ChallengeMemberView>;
}

export function DashboardTab({
  potTotal,
  weeks,
  currentWeek,
  goalCount,
  members,
}: DashboardTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="primary" padding="lg" className="text-center">
        <div className="text-[12px] opacity-85">모인 벌금</div>
        <div className="mt-1 text-[32px] font-extrabold tracking-tight tabular-nums">
          {potTotal.toLocaleString()}
          <sub className="ml-1 align-baseline text-[14px] font-semibold opacity-90">원</sub>
        </div>
      </Card>

      {weeks.length > 0 && (
        <Card padding="md" className="flex flex-col gap-3">
          <h3 className="t-h3">주차 기록</h3>
          <WeekChips weeks={weeks} />
        </Card>
      )}

      {currentWeek && <WeekRing status={currentWeek} />}

      <MemberStrip goalCount={goalCount} members={members} />
    </div>
  );
}
```

> `DashboardTabProps`에 `phase`·`daysRemaining`을 남겨 호출처(Task 12) props 형태를 안정적으로 유지하되, 본문에서는 구조분해하지 않는다(unused 회피). 이 둘은 현재 렌더에 쓰지 않지만 헤더 외 영역 확장 여지를 위해 계약에 유지한다. 만약 프로젝트 ESLint(`@typescript-eslint/no-unused-vars`)가 "정의했으나 안 쓴 prop"을 인터페이스 수준에서 잡지는 않으므로(구조분해만 검사) 문제 없다.

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
pnpm test "src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx"
```

Expected: PASS.

- [ ] **Step 5: lint**

```bash
pnpm lint
```

Expected: PASS. (본문에서 `phase`·`daysRemaining`을 구조분해하지 않으므로 unused 경고 없음.)

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx" "src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx"
git commit -m "feat(challenge): dashboard-tab H3 레이아웃(칩+링+누적+strip)"
```

---

## Task 12: dashboard page 가 H3 데이터 계산·전달

placeholder를 제거하고, `now` 1회로 viewer 주차 칩·이번 주 상태를 계산해 `DashboardTab`에 전달한다.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx`

- [ ] **Step 1: import 교체**

기존:

```tsx
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { challengePhase, remainingDays } from "@/lib/challenge/lifecycle";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { DashboardTab } from "../../_components/dashboard-tab";
import DashboardLoading from "./loading";
```

다음으로:

```tsx
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { challengePhase, remainingDays } from "@/lib/challenge/lifecycle";
import { toKstDayKey, dayIndexOf } from "@/lib/challenge/done-days";
import {
  buildWeekChips,
  currentWeekStatus,
  type CutoffContext,
  type CutoffPhase,
} from "@/lib/challenge/weekly";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { DashboardTab } from "../../_components/dashboard-tab";
import DashboardLoading from "./loading";
```

> `fetchChallengeFeed`는 H3에서 더 이상 쓰지 않으므로 import 제거.

- [ ] **Step 2: DashboardSection 본문 교체**

기존:

```tsx
const detail = await fetchChallengeDetail(id);
if (!detail) notFound();

const feed = await fetchChallengeFeed(id, user.id);
const totalFailures = 0; // PRD §35 결정 전 placeholder — 기존 page.tsx 와 동일.
const totalPenalty = totalFailures * detail.penaltyAmount;
// ADR-0027 — phase 로 일원화. running 만 "남은 N일", over/closed 는 "종료".
const phase = challengePhase(detail.status, detail.endAt);
const daysLeft = detail.endAt ? remainingDays(detail.endAt) : null;

return (
  <>
    <DashboardTab
      totalPenalty={totalPenalty}
      totalActions={feed.length}
      totalFailures={totalFailures}
      daysRemaining={daysLeft}
      phase={phase}
      members={detail.members}
      goalCount={detail.goalCount}
    />
  </>
);
```

다음으로:

```tsx
const detail = await fetchChallengeDetail(id);
if (!detail) notFound();

// 시간 의존: render 시점 now 1회(spec C0). running 만 today 의존, over/closed 는 deterministic.
const now = new Date();
const phase = challengePhase(detail.status, detail.endAt, now.getTime());
const daysLeft = detail.endAt ? remainingDays(detail.endAt, now.getTime()) : null;

// viewer 개인 주차 칩·이번 주 상태 — 시작된 챌린지만.
const startKey = detail.startAt ? toKstDayKey(detail.startAt) : null;
const settleable = phase === "running" || phase === "over" || phase === "closed";
const viewer = detail.members.find((m) => m.id === user.id);
const viewerDoneByWeek = viewer?.doneByWeek ?? new Map<number, number>();

let weeks: ReturnType<typeof buildWeekChips> = [];
let currentWeek: ReturnType<typeof currentWeekStatus> = null;
if (settleable && startKey) {
  const ctx: CutoffContext = {
    phase: phase as CutoffPhase,
    durationDays: detail.durationDays,
    todayDayIndex: dayIndexOf(toKstDayKey(now), startKey),
    closedAt: detail.closedAt,
    startKey,
  };
  const params = { goalCount: detail.goalCount, penaltyAmount: detail.penaltyAmount };
  weeks = buildWeekChips(viewerDoneByWeek, ctx, params);
  currentWeek = currentWeekStatus(viewerDoneByWeek, ctx, params);
}

return (
  <DashboardTab
    potTotal={detail.potTotal}
    weeks={weeks}
    currentWeek={currentWeek}
    daysRemaining={daysLeft}
    phase={phase}
    goalCount={detail.goalCount}
    members={detail.members}
  />
);
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: 전체 테스트**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx"
git commit -m "feat(challenge): dashboard page H3 데이터 계산·전달 (placeholder 제거)"
```

---

## Task 13: 최종 검증 + 주 단위 카피 정정

전체 게이트를 통과시키고, 주 단위 모델과 어긋나는 "일(day) 단위" 카피(penalty-picker · 온보딩)를 정정한다. dormant dialog 는 코드 변경 없이 향후 주의만 남긴다.

**Files:**

- Modify: `src/app/(flow)/challenge/new/_components/penalty-picker.tsx`
- Modify: `src/app/(auth)/login/_components/onboarding-slides.tsx` (+ 필요 시 `onboarding-slides.spec.tsx`)

- [ ] **Step 1: 주 단위 카피 정정 (penalty-picker · 온보딩 · dialog 노트)**

주 단위 모델과 어긋나는 "일(day) 단위" 카피를 정정한다(spec Rollout 6 + 2026-06-02 화면 표기 정리 검토).

**(a) penalty-picker.tsx** — `src/app/(flow)/challenge/new/_components/penalty-picker.tsx`. 기존:

```tsx
        1회 실패 시 예정 벌금
```

다음으로:

```tsx
        주 목표 미달 시 벌금
```

> 문구가 정확히 일치하지 않으면(개행·공백) `grep -n "실패 시" "src/app/(flow)/challenge/new/_components/penalty-picker.tsx"` 로 실제 문자열 확인 후 교체.

**(b) onboarding-slides.tsx** — `src/app/(auth)/login/_components/onboarding-slides.tsx`. 첫 사용자가 보는 모델 설명이라 일 단위면 오해가 크다. 기존:

```tsx
    title: "인증 실패 시 벌금 누적",
    body: "하루 안에 인증 못 하면 벌금이\n자동으로 쌓여요. 강제력 ON.",
```

다음으로:

```tsx
    title: "주 목표 미달 시 벌금 누적",
    body: "한 주 목표를 못 채우면 벌금이\n쌓여요. 강제력 ON.",
```

> `onboarding-slides.spec.tsx` 가 "하루"·"쌓여요"·"인증 실패" 를 단언하면 함께 갱신: `grep -n "하루\|쌓여요\|인증 실패\|벌금" "src/app/(auth)/login/_components/onboarding-slides.spec.tsx"`.

**(c) action-result-dialog.tsx — dormant 노트(코드 변경 없음)**. `FailedBody`(variant `"failed"`)는 현재 `action-form.tsx:278-285`가 trigger하지 않는 dormant 코드다(주석 "#35 결정 후 채움"). 일 단위 "벌금 추가 +N / 누적 벌금 M"을 표시하므로 주 단위 모델과 충돌하지만, **미사용이라 사용자 영향 없음**. 이번 plan에서는 건드리지 않고, **향후 #35로 활성화할 때 주 단위(현재 주 위험·확정 분리)로 재설계하고 라벨을 "모인 벌금"으로 정렬**한다는 주의만 남긴다(실제 구현 시 이 dialog 를 켜는 PR 의 책임).

- [ ] **Step 2: 전체 게이트**

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm validate:docs
```

Expected: 모두 PASS.

- [ ] **Step 3: 프로덕션 빌드 (migration·route 변경 포함)**

```bash
pnpm build
```

Expected: 빌드 성공.

- [ ] **Step 4: 수동 확인 (모바일 viewport)**

`pnpm dev` 실행 후 다음을 320/375px viewport(DevTools)에서 확인한다:

- 진행 중(running) 그룹 챌린지 현황판: 누적 금액 + 주차 칩(달성/미달/현재/미래 색 구분) + 이번 주 링 카피 + 멤버 strip 이 깨지지 않는다.
- 종료(closed) 챌린지 현황판: 링·"이번 주 진척" 미표시, 주차 칩은 달성/미달만.
- 홈 stats: "내 벌금" 라벨 + 확정 금액(인증해도 즉시 0 안 됨).
- 정보탭: "모인 벌금" 라벨.

- [ ] **Step 5: 커밋 (카피 정정)**

```bash
git add "src/app/(flow)/challenge/new/_components/penalty-picker.tsx" "src/app/(auth)/login/_components/onboarding-slides.tsx"
git commit -m "docs(challenge): penalty-picker·온보딩 카피를 주 단위 모델로 정정"
```

> `onboarding-slides.spec.tsx` 를 함께 수정했다면 add 목록에 추가한다.

---

## 후속 (별도 PR — 이 plan 범위 밖)

spec §Rollout "후속(별도)"에 명시된 문서 동기화. 이 plan은 코드 동작까지를 범위로 하고, 아래는 별도 docs PR로 분리한다(QUALITY_GATE 외과적 변경 원칙).

- `docs/PRD.md §3.3·§11` 의 goalCount 측정 단위 서술을 주 단위 모델로 업데이트.
- `docs/BE_SCHEMA.md §11` follow-up(`progress.ts`)을 본 모델로 갱신/closed_at 반영.
- 온보딩 슬라이드(`onboarding-slides.tsx`) "일 단위" 카피 점검(현재 코드베이스에 해당 문구가 없으면 생략).

---

## Self-Review (작성자 점검 결과 · 2026-06-02 누락 재검토 반영)

**Spec coverage:**

- C0 확정 규칙(all-or-nothing·자투리 전액·홈 단조·MVP·조기종료) → Task 2(weekly), Task 7(closed_at), Task 6(홈). ✓
- C1 인덱싱·목표(자투리 ceil) → Task 2 Step 1~4. ✓
- C2 주차별 done 집계(distinct day·stray 가드) → Task 2 Step 9~12. ✓
- C3 cutoff·확정/위험 분리·불변식 → Task 2 Step 5~20, Task 12. 불변식 (ii) 일관성 테스트 → Task 2 추가. ✓
- C4 computeAccruedPot 재정의 → Task 2 Step 15, Task 3·4. ✓
- C5 MVP 보정 → Task 2 Step 15(pickMvpIds), Task 5(recap). ✓
- C6 현황판 H3(칩·링·누적·strip) → Task 9·10·11·12. ✓
- migration + ADR → Task 1. ✓
- 종료 경로 closed_at → Task 7. ✓
- **화면 표기 통일(spec Why "라벨 혼재" — 표기 정리 목적의 핵심)** → 그룹 확정값 `potTotal` 을 표시하는 5개 위치(홈 running/settlement 리스트·정보탭·현황판) 모두 "모인 벌금"으로, 개인 확정은 "내 벌금"(홈)·"나의 정산"(영수증)으로 통일. 일 단위 카피(온보딩·penalty-picker) 주 단위 정정. → Task 6 Step 2~3, Task 11(현황판), Task 13(카피). ✓ (2026-06-02 표기 검토에서 라벨 불일치·온보딩 카피 발견·보강)
- **settlement-receipt 주차 표현(spec Impact 명시 파일)** → Task 5 Step 9~14. ✓ (재검토에서 누락 발견·보강)
- Verification 시나리오(over·자연closed·조기closed·NULL폴백·stray·현재주null·마감임박 정확케이스) → Task 2 테스트에 반영. ✓

**Impact Scope 파일 전수 매핑(재검토):** spec Impact 의 신규 3 + 수정 9 + migration 1 파일을 task 에 1:1 매핑 확인. 재검토 전 누락했던 `settlement-receipt.tsx` 를 Task 5 에 편입해 **현재 누락 0**. 단 `current-challenges` 의 "현재 주 상태 필드"는 홈 미사용이라 의도적 제외(Task 4 노트), week-ring 의 "이번 주 마감 문구 구분"은 일수 미표시로 회피(Task 10 노트) — 둘 다 근거 명시.

**Placeholder scan:** 모든 코드 step에 실제 코드·정확한 경로·기대 출력 포함. "적절히 처리" 류 없음. ✓

**Type consistency:** `CutoffContext`(phase/durationDays/todayDayIndex/closedAt/startKey), `WeeklyParams`(goalCount/penaltyAmount), `WeekChip`(week/goal/done/state), `CurrentWeekStatus`(week/goal/done/daysLeftInWeek/shortfall/atRiskAmount/imminent)를 Task 2에서 정의하고 Task 3~12에서 동일 이름으로 사용. 신규 필드명 일관: `ChallengeMemberView.doneByWeek`·`ChallengeDetailView.closedAt`·`challenge.myConfirmedPenalty`·`RecapView.viewerElapsedWeeks`/`viewerAchievedWeeks`·`SettlementReceipt` props `elapsedWeeks`/`achievedWeeks`. `countAchievedWeeks`(Task 2)는 recap(Task 5)에서만 호출. `computeAccruedPot`/`pickMvpIds`는 settlement(객체 1개 인자) → weekly(members 배열 + ctx + params) 시그니처 변경, 호출처 4곳 모두 새 시그니처로 교체. ✓

**알려진 주의점:**

- Task 4: `current-challenges`는 `cacheLife("minutes")`라 `now` baking. 주 경계 자정 직후 최대 1분 stale(무해)을 주석에 명시함. 더 엄격히 하려면 별도 PR에서 raw 집계만 캐시하고 page 계산으로 분리.
- Task 5: `settlement-receipt.spec.tsx` 의 기존 데이터 `goalCount: 12` 는 주 단위 `goalCountLabel`(1~7 only)에서 RangeError → Step 9에서 `goalCount: 3` 으로 교체 필수.
- Task 10: `formatKRW(3000)="3,000원"` 확인 완료(`penalty.ts` `toLocaleString("ko-KR")`). 테스트 기대 문자열 정합.
- Task 13: `penalty-picker.tsx` 문구가 정확히 일치하지 않으면 grep 으로 실제 문자열 확인 후 교체.
- 미시작(pending/accepted) 0원: weekly 단위 함수는 `ctx.phase ∈ {running,over,closed}` 만 받으므로 미시작은 read 의 `settleable` 가드(Task 3·4)와 computeAccruedPot 미호출로 0 보장. 별도 단위 테스트 대신 가드로 처리(over-engineering 회피).
- `isWeekElapsed`(spec C3 명시 함수)는 `elapsedWeeks(ctx)`(끝난 주 목록)로 통합 — `weekEndDayIndex(w) <= cutoff` 동일 판정을 모든 호출처가 공유(기능 동등).
