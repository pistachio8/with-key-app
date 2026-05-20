# Home Stats Grid + Account Input Sheet Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 가지 시각/레이아웃 결함을 외과적으로 수정한다 — (1) 홈 `StatsGrid` 의 "총 벌금" 셀에서 "원" 단위를 sub-text 로 분리해 줄바꿈 회피, (2) 그룹 상세 `AccountInputSheet` 의 select·Input·Button 높이를 h-11 (44px) 로 통일하고 Input 폰트는 16px(text-base)로 올려 iOS Safari focus 자동 zoom 회피.

**Architecture:**

- `src/lib/challenge/penalty.ts` 에 새 helper `formatKRWParts(amount): { number, unit }` 추가. 기존 `formatKRW` 는 그대로 유지 (호출처 영향 없음).
- `stats-grid.tsx` 의 `StatCell` 시그니처에 optional `unit?: string` prop 추가. 4번째 셀(총 벌금)만 unit prop 사용. 다른 셀은 기존 동작.
- `account-input-sheet.tsx` 의 select·Input·Button 에 `h-11` className, Input 에만 `text-base` (16px) 추가.

**Tech Stack:** React 19 · TypeScript · Tailwind · shadcn UI · Vitest (jsdom).

**Non-Goals (이번 PR 스코프 외):**

- 벌금 6자리(10만원+) 표기 — 별도 spec (축약 vs 폰트 축소).
- `account-info-sheet.tsx` (계좌 보기) 의 디자인 통일.
- StatsGrid 4-cell 레이아웃 자체 변경 (2×2).
- 라벨 / 도움말 폰트 크기 조정.

---

## 사전 — with-key 작업 시작 프로토콜

| 필드           | 내용                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fact**       | iPhone 13 Pro (390px) 에서 StatsGrid 셀당 ~91px. `text-2xl font-extrabold` "3,000원" 이 ~105px 점유 → wrap. AccountInputSheet 의 입력 요소들이 h-9 (~36px) 로 WCAG/HIG 권장 44pt 미달. [spec](../specs/2026-05-20-home-stats-and-account-input-polish.md). |
| **작업 범위**  | `src/app/(app)/home/_components/stats-grid.tsx` · `src/app/(app)/home/_components/stats-grid.spec.tsx` · `src/lib/challenge/penalty.ts` · `src/app/(app)/group/[id]/_components/account-input-sheet.tsx`.                                                  |
| **브랜치**     | `fix/home-stats-and-account-input-polish` (base: `develop`).                                                                                                                                                                                               |
| **데이터/RLS** | 없음.                                                                                                                                                                                                                                                      |
| **검증 계획**  | `pnpm typecheck` → `pnpm lint` → `pnpm test` → 모바일 viewport 수동 검증 5개 시나리오.                                                                                                                                                                     |

---

## 현재 상태 확인

- `src/lib/challenge/penalty.ts` — 13 줄. `formatKRW(amount)` `penaltyLabel(amount)` 두 export. `formatKRWParts` 신규 추가.
- `src/app/(app)/home/_components/stats-grid.tsx` — `StatsGrid({ activeCount, completedToday, pendingToday, totalPenalty })` 가 4개 `StatCell` 렌더. 4번째 셀이 `formatKRW(totalPenalty)` 사용.
- `src/app/(app)/home/_components/stats-grid.spec.tsx` — `expect(screen.getByText("5,000원")).toBeTruthy()` 형식 assertion. 새 구조에서는 "5,000" 과 "원" 이 별도 span 으로 분리되므로 **getByText 매칭이 깨짐**. spec 갱신 필요.
- `src/app/(app)/group/[id]/_components/account-input-sheet.tsx` — `<select>` `<Input>` `<Button>` 3 종류 요소. shadcn `Button` 의 default size 는 h-9. shadcn `Input` 도 h-9.
- `src/app/(app)/group/[id]/_components/account-info-sheet.tsx` — 참고용 (같은 그룹의 sibling sheet). 변경 없음.

---

## Test Environment Notes

- `@testing-library/jest-dom` 매처 부재 — `.toBeTruthy()` 패턴.
- 4번째 셀의 number/unit 분리 검증은 `screen.getByText("3,000")` 과 `screen.getByText("원")` 두 단계로.

---

## File Structure

| 파일                                                           | 책임                                                         | 종류             |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- |
| `src/lib/challenge/penalty.ts`                                 | `formatKRWParts(amount): { number, unit: "원" }` helper 추가 | Modify           |
| `src/lib/challenge/penalty.spec.ts`                            | 신규 helper unit test (없으면 신설, 있으면 추가)             | Create or Modify |
| `src/app/(app)/home/_components/stats-grid.tsx`                | `StatCell` 에 unit prop 추가 + 4번째 셀 unit 분리 렌더       | Modify           |
| `src/app/(app)/home/_components/stats-grid.spec.tsx`           | "5,000원" 단일 매칭을 "5,000" + "원" 분리 매칭으로 갱신      | Modify           |
| `src/app/(app)/group/[id]/_components/account-input-sheet.tsx` | select/Input/Button 의 h-11 + Input text-base 적용           | Modify           |

---

## Task 1: 브랜치 생성 + 사전 확인

**Files:** 없음

- [ ] **Step 1: develop 최신 동기화**

```bash
git fetch origin
git checkout develop
git pull origin develop
```

- [ ] **Step 2: 브랜치 생성**

```bash
git checkout -b fix/home-stats-and-account-input-polish
```

- [ ] **Step 3: 베이스라인**

```bash
pnpm install
pnpm typecheck
```

Expected: 통과.

---

## Task 2: `formatKRWParts` helper (TDD)

**Files:**

- Modify: `src/lib/challenge/penalty.ts`
- Create or Modify: `src/lib/challenge/penalty.spec.ts`

- [ ] **Step 1: spec 파일 확인 후 실패 테스트 추가**

`src/lib/challenge/penalty.spec.ts` (없으면 신설):

```ts
import { describe, it, expect } from "vitest";
import { formatKRW, formatKRWParts } from "./penalty";

describe("formatKRWParts", () => {
  it("0 → number: '0', unit: '원'", () => {
    const r = formatKRWParts(0);
    expect(r.number).toBe("0");
    expect(r.unit).toBe("원");
  });

  it("3000 → '3,000' + '원'", () => {
    const r = formatKRWParts(3000);
    expect(r.number).toBe("3,000");
    expect(r.unit).toBe("원");
  });

  it("99999 → '99,999' + '원'", () => {
    const r = formatKRWParts(99999);
    expect(r.number).toBe("99,999");
    expect(r.unit).toBe("원");
  });
});

describe("formatKRW (회귀 검증)", () => {
  it("기존 동작 유지 — '3,000원' 결합 결과", () => {
    expect(formatKRW(3000)).toBe("3,000원");
  });
});
```

만약 `penalty.spec.ts` 가 이미 존재하면 위 두 describe 블록을 추가.

- [ ] **Step 2: 테스트 실행 — FAIL**

```bash
pnpm test src/lib/challenge/penalty
```

Expected: `formatKRWParts is not a function` 또는 import 실패.

- [ ] **Step 3: 구현**

`src/lib/challenge/penalty.ts` 에 함수 추가 (기존 export 들 유지):

```ts
// stats-grid 등에서 숫자와 "원" 단위를 별도 span 으로 렌더하기 위한 helper.
// formatKRW 가 결합된 문자열을 반환하는 반면 본 함수는 부분을 반환한다.
export function formatKRWParts(amount: number): { number: string; unit: "원" } {
  return {
    number: amount.toLocaleString("ko-KR"),
    unit: "원",
  };
}
```

- [ ] **Step 4: 테스트 PASS**

```bash
pnpm test src/lib/challenge/penalty
```

Expected: 4 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/penalty.ts src/lib/challenge/penalty.spec.ts
git commit -m "feat(challenge): add formatKRWParts helper for split number/unit rendering"
```

---

## Task 3: `StatsGrid` 벌금 표기 변경 (TDD)

**Files:**

- Modify: `src/app/(app)/home/_components/stats-grid.tsx`
- Modify: `src/app/(app)/home/_components/stats-grid.spec.tsx`

- [ ] **Step 1: 기존 spec 의 assertion 갱신 (먼저 RED 유도)**

`src/app/(app)/home/_components/stats-grid.spec.tsx` 의 두 it 블록 본문을 다음으로 교체:

```ts
it("4 stats 라벨과 값이 모두 노출", () => {
  render(<StatsGrid activeCount={3} completedToday={2} pendingToday={1} totalPenalty={5000} />);
  expect(screen.getByText("진행 중")).toBeTruthy();
  expect(screen.getByText("오늘 완료")).toBeTruthy();
  expect(screen.getByText("미인증")).toBeTruthy();
  expect(screen.getByText("총 벌금")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy();
  // 벌금 셀: 숫자 + "원" 분리 렌더
  expect(screen.getByText("5,000")).toBeTruthy();
  expect(screen.getByText("원")).toBeTruthy();
});

it("값이 0이면 그대로 0 노출 (빈 상태도 비주얼 유지)", () => {
  render(<StatsGrid activeCount={0} completedToday={0} pendingToday={0} totalPenalty={0} />);
  // 4개 셀 모두 "0" — 동일 텍스트 4번 등장.
  expect(screen.getAllByText("0").length).toBe(4);
  // 벌금 단위 "원" 노출
  expect(screen.getByText("원")).toBeTruthy();
});
```

- [ ] **Step 2: 테스트 실행 — FAIL**

```bash
pnpm test src/app/\(app\)/home/_components/stats-grid.spec.tsx
```

Expected: `getByText("5,000")` 매칭 실패 (현재는 "5,000원" 결합) → FAIL.

- [ ] **Step 3: `stats-grid.tsx` 변경**

전체 파일을 다음으로 교체:

```tsx
// 모킹업 §2-B `stats4` — 4 stats (진행중·오늘완료·미인증·총벌금).
// 컬러 시멘틱: primary(active) · success(완료) · warn(미인증) · gray(누적 벌금).
// 4번째 셀은 number/"원" 분리 렌더로 iPhone 13 Pro (390px) 에서 줄바꿈 회피.

import { formatKRWParts } from "@/lib/challenge/penalty";

type Props = {
  activeCount: number;
  completedToday: number;
  pendingToday: number;
  totalPenalty: number;
};

type Tone = "primary" | "success" | "warn" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-brand-success",
  warn: "text-brand-warn",
  muted: "text-muted-foreground",
};

export function StatsGrid({ activeCount, completedToday, pendingToday, totalPenalty }: Props) {
  const penalty = formatKRWParts(totalPenalty);
  return (
    <section
      aria-label="오늘 챌린지 현황"
      className="bg-card grid grid-cols-4 rounded-2xl border p-3"
    >
      <StatCell tone="primary" value={String(activeCount)} label="진행 중" />
      <StatCell tone="success" value={String(completedToday)} label="오늘 완료" />
      <StatCell tone="warn" value={String(pendingToday)} label="미인증" />
      <StatCell tone="muted" value={penalty.number} unit={penalty.unit} label="총 벌금" />
    </section>
  );
}

function StatCell({
  tone,
  value,
  unit,
  label,
}: {
  tone: Tone;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-2xl font-extrabold tabular-nums ${TONE_CLASSES[tone]}`}>
        {value}
        {unit && <span className="text-muted-foreground ml-0.5 text-xs font-medium">{unit}</span>}
      </span>
      <span className="t-caption">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 PASS**

```bash
pnpm test src/app/\(app\)/home/_components/stats-grid.spec.tsx
```

Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/home/_components/stats-grid.tsx" "src/app/(app)/home/_components/stats-grid.spec.tsx"
git commit -m "fix(home): split 원 unit from total penalty to avoid line wrap"
```

---

## Task 4: `AccountInputSheet` 터치 타깃 + Input zoom 회피

**Files:**

- Modify: `src/app/(app)/group/[id]/_components/account-input-sheet.tsx`

이 파일은 client component (`"use client"`) 이고 spec 파일은 없음. 직접 변경 + 수동 검증 위주.

- [ ] **Step 1: select 변경**

`<select>` (L109-124 근처) 의 className 을:

Before:

```tsx
className = "border-border bg-card rounded-lg border px-3 py-2 text-[13px]";
```

After:

```tsx
className = "border-border bg-card h-11 rounded-lg border px-3 text-sm";
```

(`py-2 text-[13px]` 제거, `h-11 text-sm` 적용.)

- [ ] **Step 2: 예금주 Input 변경 (L130-135 근처)**

```tsx
<Input
  id={holderId}
  value={accountHolder}
  onChange={(e) => setAccountHolder(e.target.value)}
  maxLength={30}
  className="h-11 text-base"
/>
```

- [ ] **Step 3: 계좌번호 Input 변경 (L141-148 근처)**

```tsx
<Input
  id={numberId}
  value={accountNumber}
  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
  inputMode="numeric"
  maxLength={16}
  placeholder="숫자만 8~16자리"
  className="h-11 text-base"
/>
```

**왜 `text-base`**: iOS Safari 는 input focus 시 폰트가 16px 미만이면 viewport 를 자동 zoom-in. `text-base` = 16px 라 zoom 트리거 안 함.

- [ ] **Step 4: 풋터 Button 2개 변경 (L155-160 근처)**

```tsx
<DialogFooter className="gap-2">
  <Button
    variant="ghost"
    size="lg"
    className="h-11 text-sm"
    onClick={() => setOpen(false)}
    disabled={pending}
  >
    취소
  </Button>
  <Button size="lg" className="h-11 text-sm" onClick={submit} disabled={pending}>
    {pending ? "저장 중..." : isEdit ? "변경 저장" : "계좌 추가"}
  </Button>
</DialogFooter>
```

- [ ] **Step 5: (선택) DialogContent overflow 명시**

만약 수동 검증(Task 5)에서 iPhone SE viewport 의 가상 키보드 올라온 상태에서 풋터 잘림이 확인되면, `<DialogContent>` 에 className 추가:

```tsx
<DialogContent className="max-h-[85svh] overflow-y-auto">
```

dogfood 검증 후 결정 — Task 5 시나리오 5 에서 판단.

- [ ] **Step 6: 빌드 확인**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/group/[id]/_components/account-input-sheet.tsx"
git commit -m "fix(group): bump account input sheet inputs to h-11 + text-base (iOS zoom)"
```

---

## Task 5: 수동 검증 (모바일 viewport)

**Files:** 없음

- [ ] **Step 1: dev 서버 기동**

```bash
pnpm dev
```

Chrome DevTools → iPhone 13 Pro (390×844).

- [ ] **Step 2: 시나리오 1 — `totalPenalty=0`**

홈 진입. StatsGrid 4번째 셀: "0" + 작은 "원". 1줄 유지.

- [ ] **Step 3: 시나리오 2 — `totalPenalty=3,000`**

데이터 시드 또는 supabase 직접 수정. StatsGrid 4번째 셀: "3,000" + 작은 "원". 1줄 유지. 다른 셀과 baseline 정렬 자연.

- [ ] **Step 4: 시나리오 3 — `totalPenalty=99,999`**

5자리 경계 케이스. 여전히 1줄 유지 확인.

- [ ] **Step 5: 시나리오 4 — 계좌 추가 sheet (iPhone 13 Pro)**

그룹 상세 → "추가" → AccountInputSheet 열림 →

- select 탭: 44px 영역, 폰트 14px.
- 예금주 input 탭: 16px 폰트 → iOS Safari 시뮬레이션에서 focus 시 zoom 발생 안 함 확인.
- 계좌번호 input 탭: numeric keyboard + 16px 폰트 → zoom 없음.
- 풋터 "취소" "계좌 추가" 버튼: 각 44px 영역.

- [ ] **Step 6: 시나리오 5 — 계좌 추가 sheet (iPhone SE)**

DevTools → iPhone SE (375×667). sheet 열기 → 입력 → 가상 키보드 올라온 상태에서 풋터 버튼이 스크롤로 접근 가능한지 확인.

만약 잘림 → Task 4 Step 5 의 DialogContent overflow 명시 적용 → 재커밋.

- [ ] **Step 7: 검증 결과 기록**

PR description 의 verification 섹션에 결과 첨부.

---

## Task 6: 통합 검증 + PR 생성

**Files:** 없음

- [ ] **Step 1: 전체 검증**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: 모두 PASS.

- [ ] **Step 2: git 상태 확인**

```bash
git status
git log --oneline develop..HEAD
```

Expected: clean, 3개 커밋 (formatKRWParts / stats-grid / account-input-sheet) ± 1 (overflow fix).

- [ ] **Step 3: 원격 push**

```bash
git push -u origin fix/home-stats-and-account-input-polish
```

- [ ] **Step 4: PR 생성**

```bash
gh pr create --base develop --title "fix(ui): home stats penalty unit split + account input sheet h-11" --body "$(cat <<'EOF'
## Summary
- 홈 `StatsGrid` 의 "총 벌금" 셀에서 "원" 단위를 sub-text 로 분리해 iPhone 13 Pro (390px) 에서 4-cell 레이아웃 줄바꿈 회피.
- 그룹 상세 `AccountInputSheet` 의 select·Input·Button 을 h-11 (44px) 로 통일하고 Input 만 text-base (16px) 적용해 iOS Safari focus 자동 zoom 회피.

## Spec
- `docs/superpowers/specs/2026-05-20-home-stats-and-account-input-polish.md`
- Plan: `docs/superpowers/plans/2026-05-20-home-stats-and-account-input-polish.md`

## 가드레일 체크리스트
- [x] Server Action / RSC 경계 위반 없음
- [x] zod 타입 SoT 영향 없음
- [x] Supabase / RLS / migration 영향 없음
- [x] AnalyticsEvent 변경 없음

## Verification
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` PASS
- 수동 검증 5 시나리오 PASS (iPhone 13 Pro + iPhone SE emulation)
- formatKRWParts unit test 3건 + 회귀 1건 추가

## Out of scope (별도 처리)
- 벌금 6자리(10만원+) 표기 정책 — dogfood 데이터 후
- account-info-sheet.tsx 의 디자인 통일

## Rollback
- revert 1 commit 으로 전체 되돌리기 가능.
EOF
)"
```

- [ ] **Step 5: CI 통과 확인**

```bash
gh pr checks --watch
```

Expected: 모든 check PASS.

---

## 롤백 절차

PR 머지 후 회귀 발견 시:

```bash
git checkout develop
git pull origin develop
git revert <merge-commit-sha> -m 1
git push origin develop
```

부분 롤백 (벌금 표기 또는 sheet 만 되돌리기) 도 가능하지만, 일반적으로 전체 revert 후 재시도가 안전.

---

## Verification Summary

| 종류 | 명령             | 통과 기준                                                      |
| ---- | ---------------- | -------------------------------------------------------------- |
| 타입 | `pnpm typecheck` | 0 errors                                                       |
| 린트 | `pnpm lint`      | 0 errors                                                       |
| 단위 | `pnpm test`      | penalty + stats-grid spec PASS                                 |
| 빌드 | `pnpm build`     | 성공                                                           |
| 수동 | 5 시나리오       | iPhone 13 Pro + SE 에서 wrap 없음 · 44pt 터치 영역 · zoom 없음 |
| CI   | GitHub PR checks | 전부 PASS                                                      |
