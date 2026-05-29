# 정산 영수증 (Settlement Receipt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** recap(정산) 페이지의 핵심 4섹션(MyPenaltyCard·InvitationHeader·MemberRoster·SettlementAccount)을 공유 카드 톤(CREAM/INK/TERRA)의 단일 "정산 영수증" 카드 하나로 통합한다.

**Architecture:** 신규 `SettlementReceipt`(서버 컴포넌트, props-only presentational)가 4섹션을 대체한다. `fetchRecap`이 이미 주는 필드만 쓰므로 DB/RLS 변경이 없다. 색은 `globals.css` 토큰으로, 도장은 기존 `Stamp` 컴포넌트 재사용, 로고는 영수증 톤으로 recolor한 SVG로 처리한다.

**Tech Stack:** Next.js 16 App Router · React 19 RSC · TypeScript · Tailwind v4 · Vitest + @testing-library/react.

**확정 spec:** [`docs/superpowers/specs/2026-05-29-settlement-receipt-design.md`](../specs/2026-05-29-settlement-receipt-design.md) (커밋 `9b0a8e1`)

**브랜치:** `feat/recap-settlement-receipt` (이미 `origin/develop`에서 분기됨). PR 베이스 `develop`.

---

## 파일 구조

| 파일                                                                                                          | 책임                                                   | 작업         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| `src/app/globals.css`                                                                                         | 영수증·공유 카드 공통 색 토큰 + 영수증 모노 폰트 토큰  | 수정(Task 1) |
| `public/logo-from-with-warm.svg`                                                                              | 영수증 톤 recolor 로고 (원본 불변)                     | 신규(Task 2) |
| `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx`                                       | 통합 영수증 RSC (presentational)                       | 신규(Task 3) |
| `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx`                                  | 단위 테스트                                            | 신규(Task 3) |
| `src/app/(app)/challenge/[id]/recap/page.tsx`                                                                 | 4섹션 → SettlementReceipt 교체, PhotoGallery 항상 표시 | 수정(Task 4) |
| `my-penalty-card.tsx`·`invitation-header.tsx`·`member-roster.tsx`·`settlement-account.tsx` (+ 각 `.spec.tsx`) | 통합 후 고아                                           | 삭제(Task 5) |

**작업 순서 주의:** Task 4(page에서 옛 4컴포넌트 import 제거)가 Task 5(옛 컴포넌트 삭제)보다 **먼저**여야 한다. 순서가 바뀌면 중간 커밋에서 빌드가 깨진다.

---

### Task 1: globals.css 색·폰트 토큰 추가

**Files:**

- Modify: `src/app/globals.css` (`@theme inline` 블록 ~line 12, `:root` invite 토큰 블록 ~line 130)

토큰은 단위 테스트 대상이 아니므로(빌드 타임 CSS) grep + build로 검증한다.

- [ ] **Step 1: `@theme inline`에 영수증 폰트 토큰 추가**

`src/app/globals.css`의 `@theme inline { ... }` 안, `--font-heading: var(--font-sans);` 다음 줄에 추가:

```css
--font-heading: var(--font-sans);
/* 영수증 전용 모노 — 숫자/라틴은 모노, 한글은 var(--font-sans) 폴백 (spec §R1) */
--font-receipt: ui-monospace, SFMono-Regular, Menlo, "Liberation Mono", var(--font-sans), monospace;
```

`@theme`에 등록하면 Tailwind가 `font-receipt` 유틸리티를 생성한다.

- [ ] **Step 2: `:root` invite 토큰 블록에 색 토큰 4개 추가**

`--invite-line: #e5d8c2;` 다음 줄(블록 닫기 `}` 직전)에 추가:

```css
--invite-line: #e5d8c2;
/* 정산 영수증 — 공유 카드 templates.tsx 와 동일 팔레트 (spec §색 토큰) */
--invite-terra: #c2683d;
--invite-subtext: #8e8579;
--invite-dashline: #c9c0b0;
--invite-stamp: #4a3f37;
```

- [ ] **Step 3: 토큰 추가 검증**

Run: `rg "invite-terra|invite-subtext|invite-dashline|invite-stamp|font-receipt" src/app/globals.css`
Expected: 5개 라인 모두 출력

- [ ] **Step 4: 빌드 영향 없는지 타입체크**

Run: `pnpm typecheck`
Expected: PASS (CSS 변경은 타입 무관, 회귀 없음 확인용)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(recap): 정산 영수증 색·폰트 토큰 추가 (--invite-terra/subtext/dashline/stamp, --font-receipt)"
```

---

### Task 2: 영수증 톤 로고 SVG 추가

**Files:**

- Create: `public/logo-from-with-warm.svg`

원본 `public/logo-from-with.svg`(from 파랑/dot 갈색/with 노랑)를 영수증 팔레트로 recolor한 **별도 파일**. 원본은 app-header 등 전역에서 쓰므로 불변.

- [ ] **Step 1: recolor SVG 생성**

`public/logo-from-with-warm.svg` 전체 내용:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 328 64" role="img" aria-labelledby="logo-warm-title">
  <title id="logo-warm-title">from with</title>
  <text
    x="7"
    y="50"
    fill="#5e4838"
    font-family="Arial Rounded MT Bold, Avenir Next Rounded, Nunito, Quicksand, sans-serif"
    font-size="54"
    font-weight="800"
    letter-spacing="-0.5"
    textLength="142"
    lengthAdjust="spacingAndGlyphs"
  >from</text>
  <circle cx="162" cy="37" r="5.2" fill="#c2683d" />
  <text
    x="183"
    y="50"
    fill="#2a221c"
    font-family="Arial Rounded MT Bold, Avenir Next Rounded, Nunito, Quicksand, sans-serif"
    font-size="54"
    font-weight="800"
    letter-spacing="-0.5"
    textLength="132"
    lengthAdjust="spacingAndGlyphs"
  >with</text>
</svg>
```

(색만 변경: from `#4e78df`→`#5e4838` · dot `#6a5018`→`#c2683d` · with `#f9b514`→`#2a221c`)

- [ ] **Step 2: 파일 검증**

Run: `rg "5e4838|c2683d|2a221c" public/logo-from-with-warm.svg`
Expected: 3개 fill 색 모두 출력

- [ ] **Step 3: Commit**

```bash
git add public/logo-from-with-warm.svg
git commit -m "feat(recap): 영수증 톤 recolor 로고 logo-from-with-warm.svg 추가"
```

---

### Task 3: SettlementReceipt 컴포넌트 (TDD)

**Files:**

- Create: `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx`

순수 presentational 서버 컴포넌트(`"use client"` 없음). `Stamp`는 non-client라 RSC 내 사용 가능.

- [ ] **Step 1: 실패하는 테스트 작성**

`settlement-receipt.spec.tsx` 전체:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementReceipt } from "./settlement-receipt";

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

describe("SettlementReceipt", () => {
  it("그룹 미달: 항목 + TERRA 금액 + CREW + ACCOUNT + 미달 footer 렌더", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
      />,
    );
    expect(screen.getByText(/우리 그룹/)).toBeTruthy();
    expect(screen.getByText("12회")).toBeTruthy(); // 목표 인증
    expect(screen.getByText("9회")).toBeTruthy(); // 나의 인증
    expect(screen.getByText(/미달/)).toBeTruthy();
    expect(screen.getByText("4,000원")).toBeTruthy();
    expect(screen.getByText(/👑 민지/)).toBeTruthy(); // 왕관이 이름 왼쪽
    expect(screen.getByText(/KB국민/)).toBeTruthy();
    expect(screen.getByText(/1234/)).toBeTruthy();
    expect(screen.getByText(/수고했어요/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "from·with" })).toBeTruthy(); // 도장
  });

  it("달성: 0원 + 달성 판정 + 축하 footer (트레일링 이모지 없음)", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={12}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
      />,
    );
    expect(screen.getByText("0원")).toBeTruthy();
    expect(screen.getByText(/달성/)).toBeTruthy();
    expect(screen.getByText(/끝까지 해냈어요/)).toBeTruthy();
  });

  it("솔로: CREW·ACCOUNT 미렌더, 그룹명 미표시", () => {
    render(
      <SettlementReceipt
        title="아침 루틴"
        durationDays={12}
        startAt="2026-05-01T00:00:00Z"
        endAt="2026-05-12T00:00:00Z"
        goalCount={12}
        members={[{ id: "a", displayName: "민지", isMvp: true }]}
        groupName={null}
        isSolo={true}
        viewerDoneCount={12}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
      />,
    );
    expect(screen.queryByText("CREW")).toBeNull();
    expect(screen.queryByText("ACCOUNT")).toBeNull();
    expect(screen.queryByText(/우리 그룹/)).toBeNull();
  });

  it("계좌 미설정(null): ACCOUNT 줄 미렌더, CREW 는 표시", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode={null}
        accountHolder={null}
        accountNumberLast4={null}
      />,
    );
    expect(screen.queryByText("ACCOUNT")).toBeNull();
    expect(screen.getByText("CREW")).toBeTruthy();
  });

  it("기간(startAt/endAt) null: 기간 줄 없이도 본체 렌더", () => {
    render(
      <SettlementReceipt
        {...base}
        startAt={null}
        endAt={null}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode={null}
        accountHolder={null}
        accountNumberLast4={null}
      />,
    );
    expect(screen.getByText("4,000원")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run settlement-receipt`
Expected: FAIL — `Failed to resolve import "./settlement-receipt"` (컴포넌트 미존재)

- [ ] **Step 3: 컴포넌트 구현**

`settlement-receipt.tsx` 전체:

```tsx
// src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx
import Image from "next/image";
import { formatKRW } from "@/lib/challenge/penalty";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { Stamp } from "@/components/ui/stamp";
import { cn } from "@/lib/utils";

type Props = {
  groupName: string | null; // 솔로면 null → 그룹명 생략
  title: string;
  durationDays: number;
  startAt: string | null; // null 이면 기간 줄 생략
  endAt: string | null;
  goalCount: number;
  viewerDoneCount: number;
  viewerAchieved: boolean;
  viewerPerHeadPenalty: number;
  isSolo: boolean;
  members: ReadonlyArray<{ id: string; displayName: string; isMvp: boolean }>;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

// InvitationHeader 와 동일한 UTC 기준 날짜 포맷 (예: "2026 · 05 · 01")
function fmtPart(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return withYear ? `${y} · ${m} · ${day}` : `${m} · ${day}`;
}

function bankLabel(code: string): string {
  return (BANK_NAMES as Record<string, string>)[code as BankCode] ?? code;
}

const DASH = "my-3 border-t border-dashed border-[var(--invite-dashline)]";
const LABEL = "text-[10px] tracking-[0.15em] text-[var(--invite-subtext)]";

export function SettlementReceipt({
  groupName,
  title,
  durationDays,
  startAt,
  endAt,
  goalCount,
  viewerDoneCount,
  viewerAchieved,
  viewerPerHeadPenalty,
  isSolo,
  members,
  bankCode,
  accountHolder,
  accountNumberLast4,
}: Props) {
  // 셋 다 채워졌을 때만 ACCOUNT — 삼중 truthy 체크로 각 값이 string 으로 narrowing (assertion 불필요)
  const account =
    bankCode && accountHolder && accountNumberLast4
      ? { code: bankCode, holder: accountHolder, last4: accountNumberLast4 }
      : null;
  const period = startAt && endAt ? `${fmtPart(startAt, true)} — ${fmtPart(endAt, false)}` : null;

  return (
    <section
      aria-label="정산 영수증"
      className="font-receipt border-y-2 border-dashed border-[var(--invite-dashline)] bg-[var(--invite-bg)] px-5 py-5 text-[var(--invite-ink)]"
    >
      {/* 헤더 */}
      <div className="flex flex-col items-center text-center">
        {/* 장식용 로고 — from·with 접근성 이름은 하단 Stamp 가 담당 (role=img name 중복 방지) */}
        <Image
          src="/logo-from-with-warm.svg"
          alt=""
          width={123}
          height={24}
          className="h-6 w-auto"
        />
        <p className="mt-2 text-[11px] text-[var(--invite-subtext)]">
          🧾 정산 영수증{groupName ? ` · ${groupName}` : ""}
        </p>
        <p className="text-[11px] text-[var(--invite-subtext)]">
          {title} · {durationDays}일{period ? ` · ${period}` : ""}
        </p>
      </div>

      <div className={DASH} />

      {/* 항목 */}
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

      <div className={DASH} />

      {/* 나의 정산 — 미달 TERRA / 달성 0원 INK */}
      <div className="flex items-baseline justify-between">
        <span className={LABEL}>나의 정산</span>
        <span
          className={cn(
            "text-2xl font-bold",
            viewerAchieved ? "text-[var(--invite-ink)]" : "text-[var(--invite-terra)]",
          )}
        >
          {formatKRW(viewerPerHeadPenalty)}
        </span>
      </div>

      {/* 그룹 전용: CREW + ACCOUNT */}
      {!isSolo && (
        <>
          <div className={DASH} />
          <p className={LABEL}>CREW</p>
          <p className="mt-1 text-[13px] leading-relaxed font-medium break-keep">
            {members.map((m) => (m.isMvp ? `👑 ${m.displayName}` : m.displayName)).join(" · ")}
          </p>
          {account && (
            <>
              <p className={cn(LABEL, "mt-3")}>ACCOUNT</p>
              <p className="mt-1 text-[13px]">
                {bankLabel(account.code)} ***-****{account.last4} ·{" "}
                <span className="font-semibold">{account.holder}</span>
              </p>
            </>
          )}
        </>
      )}

      <div className={DASH} />

      {/* footer */}
      <p className="text-center text-[11px] text-[var(--invite-subtext)]">
        {viewerAchieved ? "끝까지 해냈어요 👏" : "오늘도 인증, 수고했어요 😜"}
      </p>

      {/* from·with 도장 — 기존 Stamp 재사용, INK 톤다운 색 + animate-stamp-in 내장 */}
      <div className="mt-3 flex justify-center">
        <Stamp
          variant="wordmark"
          className="size-14 border-[var(--invite-stamp)] text-[var(--invite-stamp)]"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run settlement-receipt`
Expected: PASS (5 tests)

- [ ] **Step 5: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (any/non-null assertion 없음 확인)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx" "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.spec.tsx"
git commit -m "feat(recap): SettlementReceipt 통합 영수증 컴포넌트 추가"
```

---

### Task 4: recap/page.tsx — 4섹션 → SettlementReceipt 교체

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`

옛 4컴포넌트 import·렌더 제거, `SettlementReceipt` 하나로 교체, `PhotoGallery`를 `!isSolo` 밖으로(솔로도 표시), 미사용 `totalPenalty` 제거.

- [ ] **Step 1: import 교체**

`page.tsx` 상단 import 블록(line 10~14)에서 4줄 제거하고 1줄 추가. 교체 후 import 영역:

```tsx
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { track } from "@/lib/analytics/track";
import { Card } from "@/components/ui/card";
import { AccountInlinePrompt } from "./_components/account-inline-prompt";
import { PhotoGallery } from "./_components/photo-gallery";
import { SettlementReceipt } from "./_components/settlement-receipt";
import { ShareCardAction } from "./_components/share-card-action";
```

(제거: `InvitationHeader` / `MemberRoster` / `SettlementAccount` / `MyPenaltyCard` import 4줄)

- [ ] **Step 2: 미사용 `totalPenalty` 계산 제거**

`page.tsx`에서 아래 블록을 **삭제**한다 (MyPenaltyCard 제거로 더 이상 안 쓰임):

```tsx
// 모킹업 §11 — "최종 벌금" = 미달성자 수 × penalty_amount.
const totalPenalty = recap.members.reduce(
  (sum, m) => sum + (m.achieved ? 0 : recap.penaltyAmount),
  0,
);
```

(`isSolo`·`groupName`·`shareMessage`·`hasAccount`·`isEarlyEnded`·`isOwner`는 유지)

- [ ] **Step 3: 렌더 본문 교체**

`return (...)` 안에서 `<MyPenaltyCard .../>` 와 `{!isSolo && recap.startAt && recap.endAt && ( ... )}` 블록을 통째로 다음으로 교체:

```tsx
      <SettlementReceipt
        groupName={isSolo ? null : groupName}
        title={recap.title}
        durationDays={recap.durationDays}
        startAt={recap.startAt}
        endAt={recap.endAt}
        goalCount={recap.goalCount}
        viewerDoneCount={recap.viewerDoneCount}
        viewerAchieved={recap.viewerAchieved}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
        isSolo={isSolo}
        members={recap.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          isMvp: m.isMvp,
        }))}
        bankCode={recap.group?.bankCode ?? null}
        accountHolder={recap.group?.accountHolder ?? null}
        accountNumberLast4={recap.group?.accountNumberLast4 ?? null}
      />

      <PhotoGallery photos={photos} />
```

(`AccountInlinePrompt`·`isEarlyEnded` 배너는 그 위에 그대로, `ShareCardAction`은 그 아래 그대로 유지)

- [ ] **Step 4: 타입·린트·테스트**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run recap`
Expected: PASS. (이 시점엔 옛 4컴포넌트 파일이 아직 존재하지만 page가 import 안 함 → 미사용 파일일 뿐 빌드 OK. 옛 spec들도 그대로 통과)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "feat(recap): 정산 페이지를 SettlementReceipt 로 교체 + PhotoGallery 솔로 표시"
```

---

### Task 5: 고아가 된 옛 4컴포넌트 + spec 삭제

**Files:**

- Delete: `my-penalty-card.tsx` · `my-penalty-card.spec.tsx`
- Delete: `invitation-header.tsx` · `invitation-header.spec.tsx`
- Delete: `member-roster.tsx` · `member-roster.spec.tsx`
- Delete: `settlement-account.tsx` · `settlement-account.spec.tsx`

(모두 `src/app/(app)/challenge/[id]/recap/_components/` 아래. Task 4 이후 어디서도 import 안 됨 — grep으로 확인됨.)

- [ ] **Step 1: 잔존 참조 0 재확인**

Run: `rg "MyPenaltyCard|InvitationHeader|MemberRoster|SettlementAccount" src --type ts -g '*.tsx' -g '*.ts' | rg -v "_components/(my-penalty-card|invitation-header|member-roster|settlement-account)"`
Expected: **출력 없음** (page.tsx 등 외부 참조 0)

- [ ] **Step 2: 8개 파일 삭제**

```bash
cd "src/app/(app)/challenge/[id]/recap/_components"
git rm my-penalty-card.tsx my-penalty-card.spec.tsx \
       invitation-header.tsx invitation-header.spec.tsx \
       member-roster.tsx member-roster.spec.tsx \
       settlement-account.tsx settlement-account.spec.tsx
cd -
```

- [ ] **Step 3: 전체 검증 (회귀 없음)**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS (삭제된 spec이 빠진 채 전체 그린)

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(recap): SettlementReceipt 통합으로 고아가 된 정산 4컴포넌트 제거"
```

---

### Task 6: 최종 검증 (빌드 + 수동)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 프로덕션 빌드**

Run: `pnpm build`
Expected: PASS (CSS 토큰·next/image·RSC 경계 이상 없음)

- [ ] **Step 2: 로컬 dev 모바일 viewport 수동 확인**

Run: `pnpm dev` → `http://localhost:3000` → 종료된 챌린지의 `/challenge/<id>/recap` 진입 (DevTools 모바일 에뮬레이션 375px).

확인 체크리스트:

- [ ] 그룹 챌린지: 로고(warm tri-tone) + 항목 + 나의 정산 + CREW(👑 이름 왼쪽) + ACCOUNT + footer + 도장(찍히는 애니메이션 1회)
- [ ] 솔로 챌린지: CREW·ACCOUNT 없음, 그룹명 없음, **PhotoGallery 표시됨**, 0원 표기(트레일링 이모지 없음)
- [ ] 미달자: 나의 정산이 TERRA 색 금액 / 달성자: INK "0원"
- [ ] 계좌 미설정 그룹: ACCOUNT 줄만 빠지고 나머지 정상
- [ ] 멤버 8~10명: CREW 가 가로 overflow 없이 줄바꿈 (한글 break-keep)
- [ ] 영수증은 좌우 여백 있는 contained 카드, PhotoGallery 는 full-bleed (의도된 차이)

- [ ] **Step 3: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: PASS (spec/plan 내부 링크 깨짐 없음)

- [ ] **Step 4: (해당 시) PR 생성**

베이스 `develop`. 본문 한국어. spec·plan 링크 + 가드레일 체크 + Verification + Rollback 포함. (커밋·푸시·PR은 사용자 확인 후)

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage:** spec 각 절 ↔ task 매핑 확인 —

- Summary/Design C1 → Task 3 · 색 토큰 → Task 1 · 로고 recolor → Task 2 · page 교체+PhotoGallery 이동 → Task 4 · 4컴포넌트 삭제 → Task 5 · Verification(빌드/수동) → Task 6. **누락 없음.**
- §R1 모노 폰트 → Task 1 `--font-receipt` + Task 3 `font-receipt`. §R2 contained/full-bleed → Task 3(영수증 border-y, -mx-4 없음) + Task 6 수동 확인. §R3 nullable 가드 → Task 3 `account`/`period` 분기 + 테스트. §R4 다인원/복수 MVP → Task 3 join+break-keep, map isMvp 각각 👑. §R5 로고 치수 → Task 3 Image width/height. §R6 이모지 → 텍스트 라벨 병행(달성/미달, footer). §R7 무영향 → track 유지, Stamp 재사용, 삭제 참조 0 확인(Task 5 Step 1).

**2. Placeholder scan:** TBD/TODO/"적절히" 없음. 모든 코드 스텝에 완전한 코드 포함.

**3. Type consistency:** `SettlementReceiptProps` 필드명이 Task 3 정의 ↔ Task 4 page 주입에서 일치(groupName/startAt/endAt/bankCode/accountHolder/accountNumberLast4 등). `formatKRW`·`BANK_NAMES`·`Stamp`·`cn` import 경로 실제 존재 확인.
