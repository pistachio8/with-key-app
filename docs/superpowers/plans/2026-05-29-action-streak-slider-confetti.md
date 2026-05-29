# 인증 완료 DaySlider streak 채도 + 챌린지 성공 컨페티 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인증 완료 모달의 `DaySlider`에 과거 인증일 streak 채도(고정 7단계)를 입히고, 오늘 인증이 챌린지 목표(`doneCount >= goalCount`)에 처음 도달하면 슬라이드 도착과 함께 컨페티를 띄운다.

**Architecture:** Server Action(`submitActionLog`)이 본인 인증 로그를 KST 캘린더 일자 distinct로 집계해 `verifiedDays`·`goalReached`를 반환한다. 순수 함수 `streakTiers()`가 일차별 농도 단계를 계산하고, `DaySlider`는 렌더만 한다. `goal-reached` 모달 variant가 `ConfettiBurst`(canvas-confetti 동적 import)를 슬라이드 도착(`onArrive`) 시 1회 발화한다. DB·RLS·migration 변경 없음.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Vitest · canvas-confetti · Tailwind v4(`globals.css` 토큰)

**Spec(SoT):** `docs/superpowers/specs/2026-05-29-action-streak-slider-confetti.md`

---

## File Structure

- `src/lib/challenge/streak-tiers.ts` (신규) — `streakTiers(verifiedDays, totalDays) → Map<일차, 0..7>` 순수 함수
- `src/lib/challenge/streak-tiers.spec.ts` (신규) — 경계 단위 테스트
- `src/lib/challenge/done-days.ts` (수정) — `kstDayDiff` · `dayIndexOf` 추가
- `src/lib/challenge/done-days.spec.ts` (수정) — 일차 helper 테스트
- `src/app/(app)/challenge/[id]/action/_actions.ts` (수정) — `verifiedDays`·`goalReached`·`goalCount` 반환, KST 일차 `currentDay`
- `src/app/(app)/challenge/[id]/action/_actions.spec.ts` (수정) — stub 갱신 + 신규 케이스
- `src/app/(app)/challenge/[id]/action/_components/day-slider.tsx` (수정) — tier 렌더 + aria-label + 가변 duration + `onArrive`
- `src/app/(app)/challenge/[id]/action/_components/day-slider.spec.tsx` (신규) — 렌더/aria 테스트
- `src/app/(app)/challenge/[id]/action/_components/confetti-burst.tsx` (신규) — canvas-confetti 동적 import
- `src/app/(app)/challenge/[id]/action/_components/confetti-burst.spec.tsx` (신규)
- `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` (수정) — `goal-reached` variant
- `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` (수정) — variant 우선순위, props 전달
- `src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx` (수정) — goalReached 케이스 + canvas-confetti mock
- `src/app/globals.css` (수정) — `--streak-1` … `--streak-7`
- `package.json` (수정) — `canvas-confetti` 의존성

검증 명령(공통): `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm validate:docs`. 단일 파일 테스트는 `pnpm test <패턴>`(예: `pnpm test streak-tiers`).

---

### Task 1: canvas-confetti 의존성 추가

**Files:**

- Modify: `package.json` (dependencies / devDependencies)

- [ ] **Step 1: 패키지 설치**

Run:

```bash
pnpm add canvas-confetti@^1.9.3
pnpm add -D @types/canvas-confetti@^1.9.0
```

- [ ] **Step 2: 설치 확인**

Run:

```bash
node -e "console.log(require('./package.json').dependencies['canvas-confetti'])"
```

Expected: 버전 문자열 출력(예: `^1.9.3`)

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS (타입 추가만)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): canvas-confetti 추가 (챌린지 성공 컨페티)"
```

---

### Task 2: `--streak-1` … `--streak-7` 디자인 토큰

**Files:**

- Modify: `src/app/globals.css` (`:root` 블록, `--brand-primary-deep` 다음)

- [ ] **Step 1: 토큰 삽입**

`src/app/globals.css`에서 `--brand-primary-deep: oklch( 0.66 0.13 268 ); /* ... */` 선언 **바로 다음 줄**(`--sidebar:` 위)에 추가:

```css
/* streak 채도 단계 — 인증 완료 DaySlider (spec 2026-05-29-action-streak-slider-confetti).
     --primary(L0.737) 계열 hue 270.7 보간. tier 1(연)→7(진). 7일+ 평탄화. */
--streak-1: oklch(0.93 0.045 270.7);
--streak-2: oklch(0.885 0.067 270.7);
--streak-3: oklch(0.84 0.088 270.7);
--streak-4: oklch(0.79 0.108 270.7);
--streak-5: oklch(0.74 0.125 270.7);
--streak-6: oklch(0.685 0.138 270.7);
--streak-7: oklch(0.62 0.15 270.7);
```

- [ ] **Step 2: lint(스타일 깨짐 없는지)**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): streak 채도 토큰 --streak-1..7 추가"
```

---

### Task 3: `streakTiers()` 순수 함수

**Files:**

- Create: `src/lib/challenge/streak-tiers.ts`
- Test: `src/lib/challenge/streak-tiers.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/lib/challenge/streak-tiers.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { streakTiers } from "./streak-tiers";

describe("streakTiers", () => {
  it("연속 인증은 매일 한 단계씩 깊어진다", () => {
    const t = streakTiers([1, 2, 3], 5);
    expect(t.get(1)).toBe(1);
    expect(t.get(2)).toBe(2);
    expect(t.get(3)).toBe(3);
  });

  it("미인증 일자는 0", () => {
    const t = streakTiers([1, 2], 4);
    expect(t.get(3)).toBe(0);
    expect(t.get(4)).toBe(0);
  });

  it("끊기면 streak 가 1 로 리셋된다", () => {
    const t = streakTiers([1, 2, 4], 4);
    expect(t.get(2)).toBe(2);
    expect(t.get(3)).toBe(0);
    expect(t.get(4)).toBe(1);
  });

  it("7일 초과는 7 로 평탄화", () => {
    const t = streakTiers([1, 2, 3, 4, 5, 6, 7, 8, 9], 9);
    expect(t.get(7)).toBe(7);
    expect(t.get(8)).toBe(7);
    expect(t.get(9)).toBe(7);
  });

  it("빈 목록은 전부 0, 키는 1..totalDays", () => {
    const t = streakTiers([], 3);
    expect(t.size).toBe(3);
    expect([...t.values()]).toEqual([0, 0, 0]);
  });

  it("범위 밖/중복 인증일은 무시(Set)", () => {
    const t = streakTiers([1, 1, 99], 3);
    expect(t.get(1)).toBe(1);
    expect(t.get(2)).toBe(0);
    expect(t.has(99)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test streak-tiers`
Expected: FAIL — `streak-tiers` 모듈 없음

- [ ] **Step 3: 구현**

Create `src/lib/challenge/streak-tiers.ts`:

```ts
// 인증 완료 DaySlider 의 streak 채도 단계 산출 (spec 2026-05-29-action-streak-slider-confetti).
// tier = 그 날까지 끊김 없이 이어온 연속 인증 일수. MAX_TIER 에서 평탄화. 0 = 미인증.
// done-days.ts 와 동일하게 "1일 1회" 가 전제(인증일은 distinct 캘린더 일차).

const MAX_TIER = 7;

export function streakTiers(
  verifiedDays: ReadonlyArray<number>,
  totalDays: number,
): Map<number, number> {
  const verified = new Set(verifiedDays);
  const tiers = new Map<number, number>();
  let run = 0;
  for (let day = 1; day <= totalDays; day++) {
    if (verified.has(day)) {
      run += 1;
      tiers.set(day, Math.min(run, MAX_TIER));
    } else {
      run = 0;
      tiers.set(day, 0);
    }
  }
  return tiers;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test streak-tiers`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge/streak-tiers.ts src/lib/challenge/streak-tiers.spec.ts
git commit -m "feat(challenge): streakTiers 순수 함수 + 테스트"
```

---

### Task 4: `kstDayDiff` · `dayIndexOf` (done-days.ts)

**Files:**

- Modify: `src/lib/challenge/done-days.ts` (파일 끝에 추가)
- Test: `src/lib/challenge/done-days.spec.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`src/lib/challenge/done-days.spec.ts` 상단 import 를 다음으로 교체:

```ts
import { countDoneDaysByUser, toKstDayKey, kstDayDiff, dayIndexOf } from "./done-days";
```

파일 끝에 describe 추가:

```ts
describe("kstDayDiff / dayIndexOf", () => {
  it("같은 날 차이는 0, 일차는 1", () => {
    expect(kstDayDiff("2026-05-29", "2026-05-29")).toBe(0);
    expect(dayIndexOf("2026-05-29", "2026-05-29")).toBe(1);
  });

  it("다음 날은 일차 2", () => {
    expect(dayIndexOf("2026-05-30", "2026-05-29")).toBe(2);
  });

  it("월 경계를 넘어도 캘린더 일수로 계산", () => {
    expect(kstDayDiff("2026-05-31", "2026-06-01")).toBe(1);
    expect(dayIndexOf("2026-06-01", "2026-05-29")).toBe(4);
  });

  it("시작일보다 이전이면 음수 일수 / 0 이하 일차", () => {
    expect(kstDayDiff("2026-05-29", "2026-05-27")).toBe(-2);
    expect(dayIndexOf("2026-05-27", "2026-05-29")).toBe(-1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test done-days`
Expected: FAIL — `kstDayDiff`/`dayIndexOf` export 없음

- [ ] **Step 3: 구현**

`src/lib/challenge/done-days.ts` 파일 끝에 추가:

```ts
// challenge 일차 인덱싱 — KST 캘린더 일자(YYYY-MM-DD) 기준, 시작일이 1일차.
// 인증일 칸 매핑과 currentDay 를 done-days 와 동일한 KST 캘린더 기준으로 맞추기 위함
// (raw ms 버킷은 자정 경계에서 어긋날 수 있음). 한국은 DST 없음 → UTC 자정 차이로 안전.
export function kstDayDiff(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function dayIndexOf(kstDayKey: string, startKstDayKey: string): number {
  return kstDayDiff(startKstDayKey, kstDayKey) + 1;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test done-days`
Expected: PASS (기존 + 신규 4 케이스)

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge/done-days.ts src/lib/challenge/done-days.spec.ts
git commit -m "feat(challenge): KST 캘린더 일차 helper kstDayDiff/dayIndexOf"
```

---

### Task 5: Server Action — verifiedDays · goalReached · KST currentDay

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_actions.ts`
- Test: `src/app/(app)/challenge/[id]/action/_actions.spec.ts`

- [ ] **Step 1: import 추가**

`_actions.ts` import 블록(현재 line 13 `createClient` import 다음 줄)에 추가:

```ts
import { toKstDayKey, dayIndexOf } from "@/lib/challenge/done-days";
```

- [ ] **Step 2: `SubmitResult` 타입 확장**

`type SubmitResult = { … }` (현재 line 16~26)을 다음으로 교체:

```ts
type SubmitResult = {
  id: string;
  summary: string;
  photoAttached: boolean;
  // 첫 인증 성공 모달(§10-C) 분기.
  isFirstAction: boolean;
  // 슬라이드 day 카운터(§10-B) — KST 캘린더 기준 오늘 일차 (1-indexed, clamp 1..totalDays).
  currentDay: number;
  // 총 챌린지 일수 (DaySlider 1..N).
  totalDays: number;
  // 인증한 challenge 일차 인덱스(1..totalDays, 정렬) — streak 채도용.
  verifiedDays: number[];
  // 이번 제출이 누적 인증일수를 goalCount 에 처음 도달시켰는지(컨페티 트리거).
  goalReached: boolean;
  // 목표 횟수(주 N회 빈도값, POC 정산은 전체 distinct 일수와 비교).
  goalCount: number;
};
```

- [ ] **Step 3: 챌린지 select 에 `goal_count` 추가**

현재 line 71 의 select 문자열을 교체:

```ts
      .select("user_id, challenges!inner(status, start_at, end_at, duration_days, goal_count)")
```

- [ ] **Step 4: priorCount 블록 → KST 집계로 교체**

현재 line 91~103 (주석 "첫 인증 모달 분기" 부터 `const currentDay = …` 까지)을 다음으로 교체:

```ts
// 본인 인증 로그(생성시각) 전체 조회 — distinct KST 일자로 streak/달성 산출.
// insert 이전 상태이므로 오늘 인증은 todayKey 로 별도 합산한다.
const { data: priorLogs } = await supabase
  .from("action_logs")
  .select("created_at")
  .eq("challenge_id", parsed.input.challengeId)
  .eq("user_id", user.id);

const totalDays = Number(ch.duration_days);
const goalCount = Number(ch.goal_count);
const startKstDayKey = toKstDayKey(ch.start_at);
const todayKey = toKstDayKey(new Date(now));

const priorDayKeys = new Set((priorLogs ?? []).map((l) => toKstDayKey(l.created_at)));
// 첫 인증(§10-C): 본 insert 이전 로그가 0건.
const isFirstAction = (priorLogs?.length ?? 0) === 0;
const todayWasNewDay = !priorDayKeys.has(todayKey);

const allDayKeys = new Set(priorDayKeys);
allDayKeys.add(todayKey);
const verifiedDays = Array.from(allDayKeys)
  .map((key) => dayIndexOf(key, startKstDayKey))
  .filter((index) => index >= 1 && index <= totalDays)
  .sort((a, b) => a - b);

// 달성 크로싱 — 정확히 goalCount 에 처음 도달하는 제출에서만 true.
const doneCountAfter = verifiedDays.length;
const doneCountBefore = doneCountAfter - (todayWasNewDay ? 1 : 0);
const goalReached = doneCountBefore < goalCount && doneCountAfter >= goalCount;

const currentDay = Math.max(1, Math.min(totalDays, dayIndexOf(todayKey, startKstDayKey)));
```

- [ ] **Step 5: 반환에 신규 필드 추가**

현재 `return success({ … })` (line 243~250)을 교체:

```ts
return success({
  id: data.id,
  summary: aiSummary,
  photoAttached,
  isFirstAction,
  currentDay,
  totalDays,
  verifiedDays,
  goalReached,
  goalCount,
});
```

- [ ] **Step 6: 테스트 stub 갱신 — `stubDb` 교체**

`_actions.spec.ts` 의 `function stubDb(...) { … }` (현재 line 74~122) 전체를 교체:

```ts
function stubDb(
  opts: {
    startAt?: string;
    durationDays?: number;
    goalCount?: number;
    priorLogs?: string[]; // 본 insert 이전 로그의 created_at ISO 목록
  } = {},
) {
  const startAt = opts.startAt ?? new Date(Date.now() - 60_000).toISOString();
  const durationDays = opts.durationDays ?? 30;
  const goalCount = opts.goalCount ?? 7;
  const priorRows = (opts.priorLogs ?? []).map((created_at) => ({ created_at }));

  const maybeSingleParticipant = vi.fn().mockResolvedValue({
    data: {
      user_id: mocks.user.id,
      challenges: {
        status: "active",
        start_at: startAt,
        end_at: new Date(Date.now() + 86_400_000 * durationDays).toISOString(),
        duration_days: durationDays,
        goal_count: goalCount,
      },
    },
    error: null,
  });
  const challengeParticipants = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleParticipant }),
      }),
    }),
  };
  const users = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: mocks.userProfile }),
    }),
  };
  // action_logs: (a) created_at 목록 select(.eq.eq await) + (b) insert.select.single.
  const priorSelect = Promise.resolve({ data: priorRows, error: null });
  const actionLogs = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(priorSelect),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: actionLogId }, error: null }),
      }),
    }),
  };

  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === "challenge_participants") return challengeParticipants;
    if (table === "users") return users;
    if (table === "action_logs") return actionLogs;
    throw new Error(`unexpected table ${table}`);
  });
  mocks.supabase.rpc.mockResolvedValue({ error: null });
}
```

- [ ] **Step 7: 신규 케이스 테스트 추가**

`_actions.spec.ts` 의 마지막 `describe("direct manual diary", …)` 블록 **뒤**, 바깥 `describe("submitActionLog", …)` 닫기 직전에 추가:

```ts
describe("verifiedDays & goalReached", () => {
  it("오늘 첫 인증은 verifiedDays=[1], goalReached=false (goal 7)", async () => {
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({
      ok: true,
      data: { verifiedDays: [1], goalCount: 7, goalReached: false },
    });
  });

  it("goalCount=1 이면 첫 인증에서 goalReached=true", async () => {
    stubDb({ goalCount: 1 });
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({ ok: true, data: { goalReached: true } });
  });

  it("이전 2일 + 오늘(신규일) 으로 goalCount=3 에 도달하면 goalReached=true", async () => {
    // 시작 9일 전, 이전 인증 2개의 distinct 일자 + 오늘 → 누적 3일 = goal.
    const start = new Date(Date.now() - 86_400_000 * 9);
    stubDb({
      startAt: start.toISOString(),
      durationDays: 30,
      goalCount: 3,
      priorLogs: [
        new Date(Date.now() - 86_400_000 * 5).toISOString(),
        new Date(Date.now() - 86_400_000 * 2).toISOString(),
      ],
    });
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({ ok: true, data: { goalReached: true, currentDay: 10 } });
  });

  it("이미 달성된(goal=2, 이전 distinct 2일) 뒤 재인증은 goalReached=false", async () => {
    const start = new Date(Date.now() - 86_400_000 * 9);
    stubDb({
      startAt: start.toISOString(),
      durationDays: 30,
      goalCount: 2,
      priorLogs: [
        new Date(Date.now() - 86_400_000 * 5).toISOString(),
        new Date(Date.now() - 86_400_000 * 2).toISOString(),
      ],
    });
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({ ok: true, data: { goalReached: false } });
  });
});
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `pnpm test _actions`
Expected: PASS (기존 + 신규 4 케이스). 실패 시 stub 의 `priorSelect` 체인(`.eq().eq()` await) 형태를 재확인.

- [ ] **Step 9: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/challenge/[id]/action/_actions.ts" "src/app/(app)/challenge/[id]/action/_actions.spec.ts"
git commit -m "feat(action): verifiedDays·goalReached 반환 + KST 일차 currentDay"
```

---

### Task 6: DaySlider — tier 렌더 · 가변 duration · onArrive · aria

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_components/day-slider.tsx` (전체 교체)
- Test: `src/app/(app)/challenge/[id]/action/_components/day-slider.spec.tsx` (신규)

- [ ] **Step 1: 실패하는 렌더 테스트 작성**

Create `day-slider.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaySlider } from "./day-slider";

describe("DaySlider", () => {
  it("일차마다 칸을 렌더하고 aria-label 을 단다", () => {
    render(<DaySlider totalDays={5} currentDay={3} verifiedDays={[1, 2, 3]} />);
    expect(screen.getByLabelText("1일차, 인증함")).toBeTruthy();
    expect(screen.getByLabelText("3일차, 오늘 인증함")).toBeTruthy();
    expect(screen.getByLabelText("4일차, 미인증")).toBeTruthy();
    expect(screen.getByLabelText("5일차, 미인증")).toBeTruthy();
  });

  it("인증한 칸은 streak 배경 변수를 쓴다", () => {
    render(<DaySlider totalDays={3} currentDay={2} verifiedDays={[1, 2]} />);
    const day2 = screen.getByLabelText("2일차, 오늘 인증함");
    // streak 2 → --streak-2
    expect(day2.getAttribute("style")).toContain("var(--streak-2)");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test day-slider`
Expected: FAIL — `verifiedDays` prop / aria-label 없음

- [ ] **Step 3: 구현 — 전체 파일 교체**

`day-slider.tsx` 전체를 교체:

```tsx
"use client";

// 모킹업 §10-B — 1..N day 가로 슬라이드. currentDay 중앙 정렬 + streak 채도.
// 인증한 과거 일자는 streak 단계(1..7)로 채도, 오늘은 금색 링, 미인증/미래는 구분 표기.
// 슬라이드는 마운트당 1회. 거리(currentDay)가 멀수록 시간을 천천히 늘려(속도↑) 3.2s 상한.
// reduced-motion 사용자에겐 즉시 정적(애니메이션 생략). 도착 시 onArrive 1회 호출.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { streakTiers } from "@/lib/challenge/streak-tiers";

interface DaySliderProps {
  totalDays: number;
  currentDay: number;
  verifiedDays?: ReadonlyArray<number>;
  /** 슬라이드가 currentDay 에 도착했을 때 1회 호출(reduced-motion 이면 즉시). */
  onArrive?: () => void;
}

// SSR 시 useLayoutEffect 경고 회피.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 안정적 빈 배열 — verifiedDays 미지정 시 useMemo 의존성이 매 렌더 바뀌지 않도록.
const EMPTY_DAYS: ReadonlyArray<number> = [];

// 8일차 ≈ 2.0s 앵커, sub-linear 증가(거리↑ 시 속도↑), 1.6~3.2s clamp.
function slideDurationMs(currentDay: number): number {
  const ms = 2000 * Math.pow(Math.max(currentDay, 1) / 8, 0.4);
  return Math.round(Math.min(3200, Math.max(1600, ms)));
}

function chipStyle(tier: number, day: number, currentDay: number): CSSProperties {
  const ring: CSSProperties =
    day === currentDay ? { boxShadow: "0 0 0 2px var(--muted), 0 0 0 4px var(--secondary)" } : {};
  if (tier >= 1) {
    return {
      backgroundColor: `var(--streak-${tier})`,
      color: tier >= 5 ? "#fff" : "var(--foreground)",
      ...ring,
    };
  }
  if (day > currentDay) {
    return { border: "1px dashed var(--border)", color: "var(--muted-foreground)", ...ring };
  }
  // 미인증 과거일 — muted 컨테이너 위라 옅은 테두리로 구분.
  return {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    ...ring,
  };
}

function chipLabel(day: number, tier: number, currentDay: number): string {
  const status = tier >= 1 ? "인증함" : "미인증";
  return day === currentDay ? `${day}일차, 오늘 ${status}` : `${day}일차, ${status}`;
}

export function DaySlider({
  totalDays,
  currentDay,
  verifiedDays = EMPTY_DAYS,
  onArrive,
}: DaySliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  // onArrive 를 ref 로 보관 — effect deps 에서 제외해 부모의 inline 콜백이 재슬라이드를 유발하지 않게.
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  const [targetX, setTargetX] = useState(0);
  const [animate, setAnimate] = useState(false);

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const tiers = useMemo(() => streakTiers(verifiedDays, totalDays), [verifiedDays, totalDays]);
  const durationMs = slideDurationMs(currentDay);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const firstChip = track.querySelector<HTMLElement>("[data-day]");
    if (!firstChip) return;
    const chipFullWidth = firstChip.offsetWidth + 6; // gap 1.5 = 6px
    const containerCenter = container.clientWidth / 2;
    const targetCenter = (currentDay - 0.5) * chipFullWidth;
    const offset = containerCenter - targetCenter;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    firedRef.current = false;
    if (prefersReduced) {
      setAnimate(false);
      setTargetX(offset);
      firedRef.current = true;
      onArriveRef.current?.();
      return;
    }
    setTargetX(0);
    setAnimate(false);
    const id = requestAnimationFrame(() => {
      setAnimate(true);
      setTargetX(offset);
    });
    // transitionend 가 안 뜨는 환경(웹뷰의 transition 무시·거의-0 거리·탭 백그라운드 등) 대비.
    // transitionend 와 둘 중 먼저 오는 1회만 firedRef 가드로 발화 → 컨페티 누락 방지.
    const fallback = setTimeout(
      () => {
        if (firedRef.current) return;
        firedRef.current = true;
        onArriveRef.current?.();
      },
      slideDurationMs(currentDay) + 200,
    );
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(fallback);
    };
  }, [currentDay, totalDays]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "transform" || firedRef.current) return;
    firedRef.current = true;
    onArriveRef.current?.();
  }

  return (
    <div ref={containerRef} className="bg-muted overflow-hidden rounded-[12px] px-2 py-3">
      <div
        ref={trackRef}
        onTransitionEnd={handleTransitionEnd}
        className="flex w-max items-center gap-1.5"
        style={{
          transform: `translate3d(${targetX}px, 0, 0)`,
          transition: animate ? `transform ${durationMs}ms var(--ease-out-soft)` : undefined,
        }}
      >
        {days.map((d) => {
          const tier = tiers.get(d) ?? 0;
          return (
            <span
              key={d}
              data-day={d}
              aria-label={chipLabel(d, tier, currentDay)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
              style={chipStyle(tier, d, currentDay)}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test day-slider`
Expected: PASS (2 tests)

- [ ] **Step 5: typecheck**

Run: `pnpm typecheck`
Expected: PASS — `verifiedDays` 가 optional(default `[]`)이라 기존 dialog 호출부(`<DaySlider totalDays currentDay />`)가 깨지지 않는다.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/day-slider.tsx" "src/app/(app)/challenge/[id]/action/_components/day-slider.spec.tsx"
git commit -m "feat(action): DaySlider streak 채도·가변 duration·onArrive·aria-label"
```

---

### Task 7: ConfettiBurst 컴포넌트

**Files:**

- Create: `src/app/(app)/challenge/[id]/action/_components/confetti-burst.tsx`
- Test: `src/app/(app)/challenge/[id]/action/_components/confetti-burst.spec.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `confetti-burst.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const confettiFn = vi.fn();
vi.mock("canvas-confetti", () => ({ default: (...args: unknown[]) => confettiFn(...args) }));

import { ConfettiBurst } from "./confetti-burst";

describe("ConfettiBurst", () => {
  beforeEach(() => {
    confettiFn.mockClear();
    // 명시적으로 모션 허용.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it("fire=true 면 confetti 를 호출한다", async () => {
    render(<ConfettiBurst fire />);
    await waitFor(() => expect(confettiFn).toHaveBeenCalled());
  });

  it("fire=false 면 호출하지 않는다", () => {
    render(<ConfettiBurst fire={false} />);
    expect(confettiFn).not.toHaveBeenCalled();
  });

  it("reduced-motion 이면 생략한다", async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ConfettiBurst fire />);
    await new Promise((r) => setTimeout(r, 40));
    expect(confettiFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test confetti-burst`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

Create `confetti-burst.tsx`:

```tsx
"use client";

// 챌린지 성공(goal-reached) 시 상단 전 폭에서 흩날려 떨어지는 컨페티.
// canvas-confetti 를 동적 import — base 번들 미포함(web/performance). reduced-motion 이면 생략.

import { useEffect } from "react";

const BRAND_COLORS = ["#8AA4FF", "#FFD46B", "#BCA6FF", "#FFB6C6", "#52C28C"];
const DURATION_MS = 1300;

interface ConfettiBurstProps {
  /** false → true 로 바뀌는 순간 1회 발화(슬라이드 도착 시점). */
  fire: boolean;
}

export function ConfettiBurst({ fire }: ConfettiBurstProps) {
  useEffect(() => {
    if (!fire) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const end = Date.now() + DURATION_MS;
      const tick = () => {
        if (cancelled || Date.now() > end) return;
        confetti({
          particleCount: 4,
          startVelocity: 0, // 위에서 시작 → gravity 로 낙하
          ticks: 220,
          gravity: 0.6,
          scalar: 1,
          colors: BRAND_COLORS,
          origin: { x: Math.random(), y: -0.05 }, // 상단 전 폭에 분산
        });
        timers.push(setTimeout(tick, 80));
      };
      tick();
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [fire]);

  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test confetti-burst`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/confetti-burst.tsx" "src/app/(app)/challenge/[id]/action/_components/confetti-burst.spec.tsx"
git commit -m "feat(action): ConfettiBurst — canvas-confetti 상단 낙하 + reduced-motion 가드"
```

---

### Task 8: 결과 모달 — goal-reached variant

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx`

- [ ] **Step 1: import + variant 타입 추가**

상단 `import { useRouter } from "next/navigation";` 위/아래에 추가:

```ts
import { useState } from "react";
```

DaySlider import 줄 아래에 추가:

```ts
import { ConfettiBurst } from "./confetti-burst";
```

`ActionResultVariant` 타입(현재 line 13)을 교체:

```ts
export type ActionResultVariant = "completed" | "first-success" | "goal-reached" | "failed";
```

- [ ] **Step 2: Props 확장**

`interface ActionResultDialogProps` 의 `// completed variant 전용` 블록(현재 `currentDay?`/`totalDays?`)을 교체:

```ts
  // completed / goal-reached variant 전용
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
```

- [ ] **Step 3: 구조분해 + 본문 분기**

함수 인자 구조분해(현재 line 29~39)에 `verifiedDays`, `goalCount` 추가:

```ts
export function ActionResultDialog({
  open,
  onOpenChange,
  variant,
  challengeId,
  currentDay,
  totalDays,
  verifiedDays,
  goalCount,
  penaltyAdded,
  penaltyTotal,
  failedDateLabel,
}: ActionResultDialogProps) {
```

`<DialogContent>` 내부 variant 분기(현재 line 56~66)를 교체:

```tsx
{
  variant === "completed" && (
    <CompletedBody
      currentDay={currentDay ?? 1}
      totalDays={totalDays ?? 1}
      verifiedDays={verifiedDays ?? []}
    />
  );
}
{
  variant === "first-success" && <FirstSuccessBody />;
}
{
  variant === "goal-reached" && (
    <GoalReachedBody
      currentDay={currentDay ?? 1}
      totalDays={totalDays ?? 1}
      verifiedDays={verifiedDays ?? []}
      goalCount={goalCount ?? 1}
    />
  );
}
{
  variant === "failed" && (
    <FailedBody
      penaltyAdded={penaltyAdded ?? 0}
      penaltyTotal={penaltyTotal ?? 0}
      failedDateLabel={failedDateLabel ?? ""}
    />
  );
}
```

- [ ] **Step 4: CompletedBody 에 verifiedDays 전달**

`CompletedBody` (현재 line 88~103)를 교체:

```tsx
function CompletedBody({
  currentDay,
  totalDays,
  verifiedDays,
}: {
  currentDay: number;
  totalDays: number;
  verifiedDays: number[];
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-primary-soft text-primary flex size-[70px] items-center justify-center rounded-full">
        <Check className="size-9" aria-hidden="true" />
      </div>
      <DialogTitle className="t-h2">오늘 운동 인증 완료!</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        매일 한 걸음씩 쌓이고 있어요 💪
      </DialogDescription>
      <div className="mt-3 w-full">
        <DaySlider totalDays={totalDays} currentDay={currentDay} verifiedDays={verifiedDays} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: GoalReachedBody 추가**

`FirstSuccessBody` 정의 뒤에 컴포넌트 추가:

```tsx
function GoalReachedBody({
  currentDay,
  totalDays,
  verifiedDays,
  goalCount,
}: {
  currentDay: number;
  totalDays: number;
  verifiedDays: number[];
  goalCount: number;
}) {
  const [fire, setFire] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-secondary-soft flex size-[80px] items-center justify-center rounded-full text-[34px]">
        🎉
      </div>
      <DialogTitle className="t-h2">챌린지 성공!</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        목표 {goalCount}회를 모두 채웠어요 💪
      </DialogDescription>
      <div className="mt-3 w-full">
        <DaySlider
          totalDays={totalDays}
          currentDay={currentDay}
          verifiedDays={verifiedDays}
          onArrive={() => setFire(true)}
        />
      </div>
      <ConfettiBurst fire={fire} />
    </div>
  );
}
```

> 푸터의 `variant === "failed" ? … : <Button>확인</Button>` 분기는 그대로 둔다 — `goal-reached` 는 else 로 떨어져 "확인" 버튼 + `handleConfirm`(피드 탭 이동)을 그대로 사용한다.

- [ ] **Step 6: typecheck**

Run: `pnpm typecheck`
Expected: PASS — dialog 의 신규 props(`verifiedDays`/`goalCount`)는 optional, `goal-reached` 는 variant union 에 추가되어 ActionForm(미수정)도 그대로 컴파일된다.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx"
git commit -m "feat(action): goal-reached 모달 variant + ConfettiBurst 연결"
```

---

### Task 9: ActionForm — variant 우선순위 + props 전달

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_components/action-form.tsx`
- Test: `src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`action-form.spec.tsx` 상단 mock 블록에 canvas-confetti mock 추가(다른 `vi.mock` 옆):

```ts
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
```

기존 "성공 → 모달" 테스트와 동일한 흐름(사진 선택 → 키워드 선택 → 등록 클릭)을 모방해 케이스 추가:

```ts
  it("goalReached 응답이면 '챌린지 성공!' 모달을 띄운다", async () => {
    submitActionLog.mockResolvedValue({
      ok: true,
      data: {
        id: "log-1",
        summary: "ok",
        photoAttached: false,
        isFirstAction: false,
        currentDay: 3,
        totalDays: 14,
        verifiedDays: [1, 2, 3],
        goalReached: true,
        goalCount: 3,
      },
    });
    prepareForUpload.mockImplementation(async (f: File) => f);

    render(<ActionForm challengeId="c-1" />);
    selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
    await waitFor(() => screen.getByText("등록하기"));
    // 기존 성공 테스트와 동일하게 키워드 1개 선택 후 등록 클릭(같은 헬퍼/흐름 사용).
    fireEvent.click(screen.getByText("등록하기"));

    await waitFor(() => expect(screen.getByText("챌린지 성공!")).toBeTruthy());
  });
```

> 실행 에이전트 메모: 이 파일의 기존 "성공 → completed 모달" 테스트가 키워드 선택/등록까지 어떻게 진행하는지 그대로 모방한다(헬퍼 `selectPhoto`, 키워드 chip 클릭, `등록하기`). 핵심 단언은 `screen.getByText("챌린지 성공!")`.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test action-form`
Expected: FAIL — variant 가 아직 goal-reached 로 분기되지 않음

- [ ] **Step 3: ResultState 확장**

`interface ResultState`(현재 line 110~115)를 교체:

```ts
interface ResultState {
  open: boolean;
  variant: ActionResultVariant;
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
}
```

- [ ] **Step 4: 성공 시 variant 우선순위 + state 채우기**

`submit()` 내부 성공 분기 `clearDraft(...)` + `setResult({ … })`(현재 line 254~260)를 교체:

```ts
clearDraft(challengeId);
setResult({
  open: true,
  // 우선순위: goal-reached > first-success > completed
  variant: res.data.goalReached
    ? "goal-reached"
    : res.data.isFirstAction
      ? "first-success"
      : "completed",
  currentDay: res.data.currentDay,
  totalDays: res.data.totalDays,
  verifiedDays: res.data.verifiedDays,
  goalCount: res.data.goalCount,
});
```

- [ ] **Step 5: Dialog 에 신규 props 전달**

`<ActionResultDialog … />`(현재 line 437~444)를 교체:

```tsx
<ActionResultDialog
  open={result.open}
  onOpenChange={(open) => setResult((prev) => ({ ...prev, open }))}
  variant={result.variant}
  challengeId={challengeId}
  currentDay={result.currentDay}
  totalDays={result.totalDays}
  verifiedDays={result.verifiedDays}
  goalCount={result.goalCount}
/>
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test action-form`
Expected: PASS (기존 + 신규 goalReached 케이스)

- [ ] **Step 7: 전체 typecheck/lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (Task 6·8 에서 남았던 상호 의존 타입 에러 해소)

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/action-form.tsx" "src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx"
git commit -m "feat(action): 성공 모달 variant 우선순위 + verifiedDays/goalCount 전달"
```

---

### Task 10: 전체 검증 + 수동 확인

**Files:** (없음 — 검증)

- [ ] **Step 1: 전체 게이트**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

Expected: 모두 PASS

- [ ] **Step 2: 빌드(동적 import 분리 확인)**

Run: `pnpm build`
Expected: PASS. canvas-confetti 가 base 청크가 아닌 별도 청크로 분리되는지 확인.

- [ ] **Step 3: 모바일 viewport 수동 시나리오**

`pnpm dev` → `http://localhost:3000` (DevTools 모바일 에뮬레이션). 테스트 계정으로 인증 제출:

- 며칠 인증 후 완료 모달 → 과거 칸 채도, 오늘 금색 링, 오늘로 슬라이드(8일차 ≈ 2.0s, 먼 일차일수록 빠르게).
- 누적 인증일수가 goalCount 에 도달하는 제출 → "챌린지 성공!" 모달 + 슬라이드 도착 시 상단 컨페티.
- 이미 달성 후 재인증 → completed 모달(컨페티 없음).
- OS reduced-motion ON → 슬라이드/컨페티 생략, 성공 상태 정적.
- VoiceOver/색맹 시뮬레이션 → 칸 aria-label 읽힘.

- [ ] **Step 4: (사용자 확인 후) PR**

> git 계정 `pistachio8`, 자동 push/PR 은 사용자 확인 후에만. base=`develop`. PR 본문 한국어, spec/plan 링크 + 가드레일 체크 + Verification + Rollback.

---

## Self-Review (작성자 점검 결과)

- **Spec coverage:** C1(streak-tiers)=Task3, C2(KST helper)=Task4, C3(server action)=Task5, C4(dialog variant)=Task8, C5(DaySlider)=Task6, C6(ConfettiBurst)=Task7, C7(토큰)=Task2, 의존성=Task1, ActionForm 배선=Task9. 모든 spec 섹션에 대응 task 존재.
- **Placeholder scan:** Task9 Step1 의 "기존 흐름 모방"은 동일 파일의 기존 성공 테스트를 따르라는 명시 지시이며 핵심 단언(`getByText("챌린지 성공!")`)은 구체적. 그 외 TBD/TODO 없음.
- **Type consistency:** `verifiedDays:number[]`·`goalReached:boolean`·`goalCount:number`·`onArrive?:()=>void`·variant `"goal-reached"` 가 SubmitResult → ResultState → Dialog props → DaySlider/ConfettiBurst 까지 동일 명칭으로 일관. `streakTiers(verifiedDays, totalDays)` 시그니처 Task3/Task6 일치.
- **실행 순서:** `verifiedDays`(DaySlider)·`verifiedDays`/`goalCount`(dialog props)를 optional 로 두어 각 task 종료 시 typecheck 가 green 으로 유지된다. Task9 에서 ActionForm 이 실제 값을 배선하면 기능이 활성화된다.
- **컨페티 발화 보장:** `transitionend` 와 fallback 타이머(`slideDurationMs(currentDay)+200ms`) 중 먼저 오는 1회만 `firedRef` 가드로 발화. 웹뷰가 CSS transition 을 무시해도 컨페티가 누락되지 않는다.

```

```
