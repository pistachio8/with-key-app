# 글로벌 플로팅 메뉴(speed-dial FAB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챌린지 탭에만 있던 카메라 "인증하기" FAB를, (app) 로그인 후 전 화면에 뜨는 하단 중앙 speed-dial 메뉴(홈·사진 인증·그룹)로 승격한다.

**Architecture:** 서버 `(app)/layout.tsx`가 내 active 챌린지 목록과 그룹 목록을 fetch해 client `<FabMenu>`에 직렬화 가능한 props로 전달. FabMenu가 펼침 상태·애니메이션·`usePathname` 컨텍스트 판단을 소유하고, "사진 인증" 분기는 순수 함수 `resolveVerifyTarget`로 분리한다. 그룹 전환은 기존 `GroupSwitcherSheet`(Dialog) 재사용, 챌린지 2개+ 선택은 신규 `FabPhotoVerifySheet`(Dialog)로 처리. 쓰기 경로 없음(navigation/모달만) → Server Action·RLS·스키마 무변경.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind · lucide-react · sonner(toast) · vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-05-28-global-fab-menu-design.md`](../specs/2026-05-28-global-fab-menu-design.md)

**Branch:** `feat/app-shell-global-fab-menu` (spec 커밋 `1033244` 이미 존재).

---

## File Structure

신규:

- `src/lib/challenge/resolve-verify-target.ts` — "사진 인증" 타깃 결정 순수 함수. 책임: 현재 챌린지 컨텍스트 + active 목록 → navigate/picker/none.
- `src/lib/challenge/resolve-verify-target.spec.ts` — 위 함수 단위 테스트.
- `src/components/app-shell/fab-photo-verify-sheet.tsx` — active 2개+ 일 때 챌린지 선택 Dialog(client).
- `src/components/app-shell/fab-photo-verify-sheet.spec.tsx` — 위 컴포넌트 테스트.
- `src/components/app-shell/fab-menu.tsx` — speed-dial FAB 본체(client).
- `src/components/app-shell/fab-menu.spec.tsx` — 위 컴포넌트 테스트.

수정:

- `src/components/app-shell/app-header.tsx` — 우측에서 그룹 스위처 제거, 알림벨·마이만 유지. props 제거.
- `src/components/app-shell/app-header.spec.tsx` — 그룹 관련 테스트 제거, 우측 클러스터 기대값 갱신.
- `src/app/(app)/layout.tsx` — active 챌린지 fetch, `<FabMenu>` 렌더, `<AppHeader />` props 제거, `<main>` 하단 패딩.
- `src/app/(app)/challenge/[id]/(tabs)/page.tsx` — `<ActionFab>` 제거.
- `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` — `<ActionFab>` 제거.

삭제:

- `src/app/(app)/challenge/[id]/_components/action-fab.tsx` — 글로벌 FAB로 대체, 미사용.

유지(건드리지 않음):

- `src/components/ui/fab.tsx` — `action-form.tsx`의 "사진 찍기" 버튼이 계속 사용.

---

## Task 1: `resolveVerifyTarget` 순수 함수

**Files:**

- Create: `src/lib/challenge/resolve-verify-target.ts`
- Test: `src/lib/challenge/resolve-verify-target.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/challenge/resolve-verify-target.spec.ts
import { describe, it, expect } from "vitest";
import { resolveVerifyTarget } from "./resolve-verify-target";

const a = (id: string) => ({ id, title: `챌린지 ${id}`, groupName: null });

describe("resolveVerifyTarget", () => {
  it("현재 챌린지가 active 목록에 있으면 그 챌린지 action 으로 navigate", () => {
    expect(resolveVerifyTarget("c2", [a("c1"), a("c2")])).toEqual({
      kind: "navigate",
      href: "/challenge/c2/action",
    });
  });

  it("active 0개면 none", () => {
    expect(resolveVerifyTarget(null, [])).toEqual({ kind: "none" });
  });

  it("active 1개면(현재 챌린지 아님) 그 1개로 navigate", () => {
    expect(resolveVerifyTarget(null, [a("c9")])).toEqual({
      kind: "navigate",
      href: "/challenge/c9/action",
    });
  });

  it("active 2개+ 이고 현재 챌린지가 목록에 없으면 picker", () => {
    expect(resolveVerifyTarget("other", [a("c1"), a("c2")])).toEqual({ kind: "picker" });
  });

  it("현재 챌린지가 목록에 없고 active 1개면 그 1개로 navigate", () => {
    expect(resolveVerifyTarget("not-active", [a("c1")])).toEqual({
      kind: "navigate",
      href: "/challenge/c1/action",
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/challenge/resolve-verify-target.spec.ts`
Expected: FAIL — `resolve-verify-target` 모듈 없음 / `resolveVerifyTarget is not a function`.

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/challenge/resolve-verify-target.ts
export type VerifyTargetChallenge = {
  id: string;
  title: string;
  groupName: string | null;
};

export type VerifyTarget =
  | { kind: "navigate"; href: string }
  | { kind: "picker" }
  | { kind: "none" };

/**
 * "사진 인증" 버튼 클릭 시 이동/모달 분기를 결정.
 * 우선순위: 현재 챌린지 컨텍스트 → active 1개 직행 → 2개+ 선택 → 0개 안내.
 */
export function resolveVerifyTarget(
  currentChallengeId: string | null,
  active: ReadonlyArray<VerifyTargetChallenge>,
): VerifyTarget {
  if (currentChallengeId && active.some((c) => c.id === currentChallengeId)) {
    return { kind: "navigate", href: `/challenge/${currentChallengeId}/action` };
  }
  if (active.length === 1) {
    return { kind: "navigate", href: `/challenge/${active[0].id}/action` };
  }
  if (active.length >= 2) {
    return { kind: "picker" };
  }
  return { kind: "none" };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/challenge/resolve-verify-target.spec.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/resolve-verify-target.ts src/lib/challenge/resolve-verify-target.spec.ts
git commit -m "feat(challenge): 사진 인증 타깃 분기 resolveVerifyTarget 추가"
```

---

## Task 2: `FabPhotoVerifySheet` (active 2개+ 선택 Dialog)

**Files:**

- Create: `src/components/app-shell/fab-photo-verify-sheet.tsx`
- Test: `src/components/app-shell/fab-photo-verify-sheet.spec.tsx`

기존 `GroupSwitcherSheet`(Dialog 기반)와 동일 패턴을 따른다. 신규 Sheet primitive를 만들지 않는다(`sheet.tsx` 부재, POC 범위 초과 방지).

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/app-shell/fab-photo-verify-sheet.spec.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { FabPhotoVerifySheet } from "./fab-photo-verify-sheet";

const challenges = [
  { id: "c1", title: "아침 7시 기상", groupName: "새벽반" },
  { id: "c2", title: "매일 만보 걷기", groupName: "걷기모임" },
];

describe("FabPhotoVerifySheet", () => {
  it("open=true 면 각 챌린지가 /challenge/{id}/action 링크로 렌더", () => {
    render(<FabPhotoVerifySheet open onOpenChange={vi.fn()} challenges={challenges} />);
    expect(screen.getByRole("link", { name: /아침 7시 기상/ }).getAttribute("href")).toBe(
      "/challenge/c1/action",
    );
    expect(screen.getByRole("link", { name: /매일 만보 걷기/ }).getAttribute("href")).toBe(
      "/challenge/c2/action",
    );
  });

  it("링크 클릭 시 onOpenChange(false) 호출", () => {
    const onOpenChange = vi.fn();
    render(<FabPhotoVerifySheet open onOpenChange={onOpenChange} challenges={challenges} />);
    screen.getByRole("link", { name: /아침 7시 기상/ }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/components/app-shell/fab-photo-verify-sheet.spec.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

```tsx
// src/components/app-shell/fab-photo-verify-sheet.tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VerifyTargetChallenge } from "@/lib/challenge/resolve-verify-target";

interface FabPhotoVerifySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenges: ReadonlyArray<VerifyTargetChallenge>;
}

export function FabPhotoVerifySheet({ open, onOpenChange, challenges }: FabPhotoVerifySheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>어느 챌린지를 인증할까요?</DialogTitle>
          <DialogDescription>사진 인증할 챌린지를 선택해 주세요.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {challenges.map((c) => (
            <li key={c.id}>
              <Link
                href={`/challenge/${c.id}/action`}
                onClick={() => onOpenChange(false)}
                className="hover:bg-muted focus-visible:bg-muted flex items-center gap-3 rounded-md px-3 py-3 focus-visible:outline-none"
              >
                <span className="t-body flex-1 truncate font-semibold">{c.title}</span>
                {c.groupName ? (
                  <span className="text-muted-foreground t-caption truncate">{c.groupName}</span>
                ) : null}
                <ChevronRight
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/components/app-shell/fab-photo-verify-sheet.spec.tsx`
Expected: PASS (2 passed).

> 참고: `DialogContent`가 radix portal로 렌더되어도 jsdom에서 `screen`은 document.body 전체를 조회하므로 링크가 잡힌다. 만약 `getByRole("link")`가 접근성 트리에서 누락되면 `screen.getByText(/아침 7시 기상/).closest("a")`로 대체.

- [ ] **Step 5: 커밋**

```bash
git add src/components/app-shell/fab-photo-verify-sheet.tsx src/components/app-shell/fab-photo-verify-sheet.spec.tsx
git commit -m "feat(app-shell): 사진 인증 챌린지 선택 FabPhotoVerifySheet 추가"
```

---

## Task 3: `FabMenu` speed-dial 본체

**Files:**

- Create: `src/components/app-shell/fab-menu.tsx`
- Test: `src/components/app-shell/fab-menu.spec.tsx`

**동작 요약**

- `/challenge/[id]/action` 경로에서는 `null` 반환(미노출).
- 닫힘=카메라 / 열림=X. 메인 아이콘 2개는 `position:absolute; inset-0; m-auto`로 버튼 정중앙에 겹쳐 cross-fade.
- 자식 3개: 좌상 홈 / 정상 사진 인증 / 우상 그룹. 닫힘 시 `inert`(비상호작용).
- 홈 → `/home` Link. 그룹 → 그룹 있으면 `GroupSwitcherSheet` 열기, 없으면 `/group/new` Link. 사진 인증 → `resolveVerifyTarget` 결과로 Link/picker/toast.
- 펼침 transition duration은 `var(--motion-base)`(reduced-motion 시 1ms로 자동 단축).

> **a11y 범위 메모:** speed-dial 본체는 `aria-expanded`·`aria-label`·scrim 탭 닫기까지 구현한다. 키보드 Esc 닫기·포커스 트랩·포커스 복귀는 이번 범위에서 **의도적으로 생략**한다 — 그룹/선택 모달은 `Dialog`(radix)가 Esc·포커스 트랩을 자체 처리하고, speed-dial은 모바일 터치 1차 대상이라 POC 단계에서 과한 구현을 피한다(spec 접근성 항목 대비 축소, 후속 보강 가능). scrim은 `aria-hidden` + `tabIndex=-1`로 a11y 트리에서 제외.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/app-shell/fab-menu.spec.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { FabMenu } from "./fab-menu";

let mockPath = "/home";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

// 하위 Dialog 들은 동작만 검증 — portal 복잡성 회피용 스텁.
vi.mock("./group-switcher-sheet", () => ({
  GroupSwitcherSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="group-sheet" /> : null,
}));
vi.mock("./fab-photo-verify-sheet", () => ({
  FabPhotoVerifySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="verify-sheet" /> : null,
}));

const oneActive = [{ id: "c1", title: "아침 기상", groupName: "새벽반" }];
const twoActive = [
  { id: "c1", title: "아침 기상", groupName: "새벽반" },
  { id: "c2", title: "만보 걷기", groupName: "걷기모임" },
];

beforeEach(() => {
  mockPath = "/home";
  toastMock.mockReset();
});

describe("FabMenu", () => {
  it("닫힘 상태: 메인 버튼 aria-expanded=false, 라벨 '메뉴 열기'", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    const main = screen.getByRole("button", { name: "메뉴 열기" });
    expect(main.getAttribute("aria-expanded")).toBe("false");
  });

  it("메인 탭 시 aria-expanded=true 로 토글되고 자식 3개(홈/사진 인증/그룹) 노출", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    expect(screen.getByRole("button", { name: "메뉴 닫기" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/home");
    expect(screen.getByLabelText("사진 인증")).toBeTruthy();
    expect(screen.getByLabelText("그룹")).toBeTruthy();
  });

  it("그룹 0개면 그룹 버튼이 /group/new 링크", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    const group = screen.getByLabelText("그룹");
    expect(group.getAttribute("href")).toBe("/group/new");
  });

  it("그룹 1개+면 그룹 버튼 클릭 시 그룹 시트 오픈", () => {
    render(
      <FabMenu
        activeChallenges={oneActive}
        groups={[{ id: "g1", name: "러닝" }]}
        newGroupNamePreview="내 그룹"
      />,
    );
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    (screen.getByLabelText("그룹") as HTMLElement).click();
    expect(screen.getByTestId("group-sheet")).toBeTruthy();
  });

  it("active 1개면 사진 인증이 그 챌린지 action 링크", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    expect(screen.getByLabelText("사진 인증").getAttribute("href")).toBe("/challenge/c1/action");
  });

  it("active 2개+면 사진 인증 클릭 시 선택 시트 오픈", () => {
    render(<FabMenu activeChallenges={twoActive} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    (screen.getByLabelText("사진 인증") as HTMLElement).click();
    expect(screen.getByTestId("verify-sheet")).toBeTruthy();
  });

  it("active 0개면 사진 인증 클릭 시 toast 안내", () => {
    render(<FabMenu activeChallenges={[]} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    (screen.getByLabelText("사진 인증") as HTMLElement).click();
    expect(toastMock).toHaveBeenCalledWith("진행 중인 챌린지가 없어요");
  });

  it("/challenge/[id]/action 경로에서는 렌더하지 않음", () => {
    mockPath = "/challenge/c1/action";
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    expect(screen.queryByRole("button", { name: "메뉴 열기" })).toBeNull();
  });

  it("챌린지 화면 안이면 사진 인증이 그 챌린지로 직행", () => {
    mockPath = "/challenge/c2/dashboard";
    render(<FabMenu activeChallenges={twoActive} groups={[]} newGroupNamePreview="내 그룹" />);
    screen.getByRole("button", { name: "메뉴 열기" }).click();
    expect(screen.getByLabelText("사진 인증").getAttribute("href")).toBe("/challenge/c2/action");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/components/app-shell/fab-menu.spec.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

```tsx
// src/components/app-shell/fab-menu.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Camera, Home, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveVerifyTarget,
  type VerifyTargetChallenge,
} from "@/lib/challenge/resolve-verify-target";
import { GroupSwitcherSheet, type GroupSwitcherItem } from "./group-switcher-sheet";
import { FabPhotoVerifySheet } from "./fab-photo-verify-sheet";

interface FabMenuProps {
  activeChallenges: ReadonlyArray<VerifyTargetChallenge>;
  groups: ReadonlyArray<GroupSwitcherItem>;
  newGroupNamePreview: string;
}

const CHILD_BASE = cn(
  "absolute bottom-0 left-1/2 -ml-6 grid size-12 place-items-center rounded-full bg-card text-primary",
  "shadow-[0_6px_16px_rgba(20,24,36,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

// 닫힘=중앙 축소, 열림=부채꼴 좌표. duration 은 --motion-base(reduced-motion 1ms).
const childStyle = (openTransform: string, delay: number, open: boolean): React.CSSProperties => ({
  transform: open ? openTransform : "translate(0px, 8px) scale(0.4)",
  opacity: open ? 1 : 0,
  transitionProperty: "transform, opacity",
  transitionDuration: "var(--motion-base)",
  transitionTimingFunction: open ? "cubic-bezier(0.34,1.42,0.5,1)" : "var(--ease-out-soft)",
  transitionDelay: open ? `${delay}ms` : "0ms",
  pointerEvents: open ? "auto" : "none",
});

function currentChallengeId(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/challenge\/([^/]+)(?:\/|$)/.exec(pathname);
  return m ? m[1] : null;
}

export function FabMenu({ activeChallenges, groups, newGroupNamePreview }: FabMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 인증 작성 화면에서는 메뉴 숨김.
  if (pathname && /^\/challenge\/[^/]+\/action$/.test(pathname)) return null;

  const close = () => setOpen(false);
  const hasGroups = groups.length >= 1;
  const target = resolveVerifyTarget(currentChallengeId(pathname), activeChallenges);

  return (
    <>
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={close}
        className={cn(
          "fixed inset-0 z-20 bg-foreground/15 transition-opacity duration-[var(--motion-base)]",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div inert={!open ? true : undefined}>
          {/* 홈 (좌상) */}
          <Link
            href="/home"
            aria-label="홈"
            onClick={close}
            className={CHILD_BASE}
            style={childStyle("translate(-78px,-94px) scale(1)", 30, open)}
          >
            <Home className="size-5" aria-hidden="true" />
          </Link>

          {/* 사진 인증 (정상) */}
          {target.kind === "navigate" ? (
            <Link
              href={target.href}
              aria-label="사진 인증"
              onClick={close}
              className={CHILD_BASE}
              style={childStyle("translate(0px,-126px) scale(1)", 95, open)}
            >
              <Camera className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              aria-label="사진 인증"
              onClick={() => {
                close();
                if (target.kind === "picker") setPickerOpen(true);
                else toast("진행 중인 챌린지가 없어요");
              }}
              className={CHILD_BASE}
              style={childStyle("translate(0px,-126px) scale(1)", 95, open)}
            >
              <Camera className="size-5" aria-hidden="true" />
            </button>
          )}

          {/* 그룹 (우상) */}
          {hasGroups ? (
            <button
              type="button"
              aria-label="그룹"
              onClick={() => {
                close();
                setGroupOpen(true);
              }}
              className={CHILD_BASE}
              style={childStyle("translate(78px,-94px) scale(1)", 160, open)}
            >
              <Users className="size-5" aria-hidden="true" />
            </button>
          ) : (
            <Link
              href="/group/new"
              aria-label="그룹"
              onClick={close}
              className={CHILD_BASE}
              style={childStyle("translate(78px,-94px) scale(1)", 160, open)}
            >
              <Users className="size-5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* 메인 토글 */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground",
            "shadow-[0_10px_22px_rgba(138,164,255,0.5)] transition-colors duration-[var(--motion-base)]",
            "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <Camera
            aria-hidden="true"
            className="absolute inset-0 m-auto size-6 transition-[opacity,transform] duration-[var(--motion-base)]"
            style={{
              opacity: open ? 0 : 1,
              transform: open ? "rotate(90deg) scale(0.5)" : "rotate(0) scale(1)",
            }}
          />
          <X
            aria-hidden="true"
            className="absolute inset-0 m-auto size-6 transition-[opacity,transform] duration-[var(--motion-base)]"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "rotate(0) scale(1)" : "rotate(-90deg) scale(0.5)",
            }}
          />
        </button>
      </div>

      <GroupSwitcherSheet
        open={groupOpen}
        onOpenChange={setGroupOpen}
        groups={groups}
        newGroupNamePreview={newGroupNamePreview}
      />
      <FabPhotoVerifySheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        challenges={activeChallenges}
      />
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/components/app-shell/fab-menu.spec.tsx`
Expected: PASS (9 passed).

> 만약 `inert` 때문에 jsdom에서 열린 뒤 자식 조회가 실패하면(현 jsdom은 inert를 시각적으로 무시하므로 보통 통과), 테스트는 항상 "메뉴 열기" 클릭 후 조회하므로 `inert={undefined}` 상태라 영향 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/components/app-shell/fab-menu.tsx src/components/app-shell/fab-menu.spec.tsx
git commit -m "feat(app-shell): 글로벌 speed-dial FabMenu(홈·사진 인증·그룹) 추가"
```

---

## Task 4: 헤더에서 그룹 스위처 제거

**Files:**

- Modify: `src/components/app-shell/app-header.tsx`
- Modify: `src/components/app-shell/app-header.spec.tsx`

그룹 전환은 FAB로 이동했으므로 헤더 우측은 알림벨 + 마이만 남긴다. `AppHeader`의 `groups`/`newGroupNamePreview` props도 제거.

- [ ] **Step 1: 테스트 먼저 갱신(실패 상태로)**

`src/components/app-shell/app-header.spec.tsx` 전체를 아래로 교체:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/home",
}));

vi.mock("@/lib/notifications/store", () => ({
  unreadCount: () => Promise.resolve(0),
}));

describe("AppHeader", () => {
  it("좌측 로고 링크가 /home 으로 이동하고 aria-label='홈'", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/home");
  });

  it("우측 컨테이너의 아이콘 순서는 알림 → 마이페이지 (그룹은 FAB로 이동)", () => {
    const { container } = render(<AppHeader />);
    const rightCluster = container.querySelector("header div.flex.items-center.gap-1");
    expect(rightCluster).not.toBeNull();
    const labels = Array.from((rightCluster as HTMLElement).querySelectorAll("a,button")).map(
      (el) => el.getAttribute("aria-label") ?? "",
    );
    expect(labels).toEqual(["알림", "마이페이지"]);
  });

  it("그룹 관련 아이콘은 헤더에 없음", () => {
    render(<AppHeader />);
    expect(screen.queryByRole("button", { name: "그룹 선택" })).toBeNull();
    expect(screen.queryByRole("link", { name: "새 그룹 만들기" })).toBeNull();
  });

  it("알림 링크는 /notifications, 마이페이지는 /me", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "알림" }).getAttribute("href")).toBe("/notifications");
    expect(screen.getByRole("link", { name: "마이페이지" }).getAttribute("href")).toBe("/me");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/components/app-shell/app-header.spec.tsx`
Expected: FAIL — 아직 그룹 아이콘이 렌더되어 `labels` 기대 불일치 / `AppHeader` props 타입 등.

- [ ] **Step 3: `app-header.tsx` 수정**

`src/components/app-shell/app-header.tsx` 전체를 아래로 교체:

```tsx
import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function AppHeader() {
  return (
    <header className="bg-background/90 sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur">
      <Link
        href="/home"
        aria-label="홈"
        className="focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center rounded-md py-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Image
          src="/logo-from-with.svg"
          alt=""
          width={144}
          height={28}
          priority
          unoptimized
          className="h-7 w-auto"
        />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <Link href="/me" aria-label="마이페이지" className={ICON_LINK_CLASSES}>
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/components/app-shell/app-header.spec.tsx`
Expected: PASS (4 passed).

> 이 시점에 `layout.tsx`가 아직 `<AppHeader groups=... />`를 전달해 타입 에러가 날 수 있다. Task 5에서 해소하므로, 지금은 이 단위 테스트 통과만 확인한다(전체 typecheck는 Task 7).

- [ ] **Step 5: 커밋**

```bash
git add src/components/app-shell/app-header.tsx src/components/app-shell/app-header.spec.tsx
git commit -m "refactor(app-shell): 헤더 우측 그룹 스위처 제거(FAB 로 이전)"
```

---

## Task 5: `(app)/layout.tsx` 배선 — active 챌린지 fetch + FabMenu 렌더

**Files:**

- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: import 추가**

`src/app/(app)/layout.tsx` 상단 import 블록에 추가:

```ts
import { FabMenu } from "@/components/app-shell/fab-menu";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
```

- [ ] **Step 2: `AppShellSection` 의 데이터 fetch 확장**

기존 `const [groups, ownerGroups, profile] = await Promise.all([...])` 부분을 아래로 교체(`fetchCurrentChallenges` 추가 + active 도출):

```ts
const [groups, ownerGroups, profile, current] = await Promise.all([
  fetchMyGroups(),
  fetchOwnerGroupsForChallengeForm(user.id),
  supabase.from("users").select("display_name").eq("id", user.id).maybeSingle(),
  fetchCurrentChallenges(user.id),
]);

const activeChallenges = current
  .filter((g) => g.challenge?.status === "active" && g.challenge.userIsParticipant)
  .map((g) => ({
    id: g.challenge!.id,
    title: g.challenge!.title,
    groupName: g.groupName,
  }));
```

- [ ] **Step 3: 렌더 트리 수정**

`AppShellSection`의 `return (...)`을 아래로 교체 — `<AppHeader>` props 제거, `<main>`에 하단 패딩, `<FabMenu>` 추가:

```tsx
return (
  <>
    <AppHeader />
    <main id="main" className="flex-1 pb-24">
      {children}
    </main>
    <FabMenu
      activeChallenges={activeChallenges}
      groups={groups}
      newGroupNamePreview={newGroupNamePreview}
    />
  </>
);
```

- [ ] **Step 4: 타입체크**

Run: `pnpm typecheck`
Expected: PASS — `AppHeader` props 제거와 정합. (만약 `groups` 타입이 `GroupSwitcherItem[]`과 불일치하면 `fetchMyGroups` 반환 타입을 확인; 기존 헤더가 받던 동일 값이므로 호환된다.)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(app-shell): (app) 레이아웃에 글로벌 FabMenu 배선 + active 챌린지 주입"
```

---

## Task 6: 기존 per-challenge ActionFab 제거

**Files:**

- Modify: `src/app/(app)/challenge/[id]/(tabs)/page.tsx`
- Modify: `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx`
- Delete: `src/app/(app)/challenge/[id]/_components/action-fab.tsx`

- [ ] **Step 1: `(tabs)/page.tsx` 에서 ActionFab 제거**

- `import { ActionFab } from "../_components/action-fab";` 라인 삭제.
- `actionHref` 계산 라인 삭제(다른 곳에서 미사용 확인 후): `const actionHref = isParticipant && detail.status === "active" ? ... : undefined;`
- JSX의 `<ActionFab href={actionHref} />` 라인 삭제.

수정 후 return 블록은 `<FeedTab .../>`만 남는다(감싸는 `<>...</>`는 단일 자식이어도 무방).

- [ ] **Step 2: `(tabs)/dashboard/page.tsx` 에서 ActionFab 제거**

동일하게 `import { ActionFab } ...`, `actionHref` 계산(있다면), `<ActionFab href={actionHref} />`를 삭제. dashboard 페이지에서 `actionHref`가 ActionFab에만 쓰이는지 확인 후 제거.

- [ ] **Step 3: action-fab.tsx 삭제**

```bash
git rm "src/app/(app)/challenge/[id]/_components/action-fab.tsx"
```

- [ ] **Step 4: 잔여 참조 확인 + 타입체크**

Run: `rg -n "action-fab|ActionFab" src`
Expected: 출력 없음.

Run: `pnpm typecheck`
Expected: PASS (제거한 `actionHref` 미사용 변수 등 에러 없음).

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/(tabs)/page.tsx" "src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx"
git commit -m "refactor(challenge): per-challenge ActionFab 제거(글로벌 FabMenu 로 대체)"
```

---

## Task 7: 전체 검증 + 수동 QA

**Files:** 없음(검증).

- [ ] **Step 1: 정적 검증 일괄 실행**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 모두 PASS. (신규 spec 3종 + 갱신된 header spec 포함.)

- [ ] **Step 2: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`.

- [ ] **Step 3: 수동 QA (모바일 viewport, `pnpm dev` → http://localhost:3000)**

체크리스트:

- [ ] 홈·피드·그룹·마이에서 하단 중앙 FAB 노출, 탭 시 부채꼴 펼침/접힘, 카메라↔X 모핑 중앙정렬.
- [ ] 홈 버튼 → `/home`, 그룹 버튼(그룹 0개) → `/group/new`, (그룹 1개+) → 그룹 선택 모달.
- [ ] 사진 인증: active 0개 → 토스트 "진행 중인 챌린지가 없어요" / 1개 → 해당 action 화면 / 2개+ → 선택 모달 → 행 탭 시 action 화면.
- [ ] 챌린지 화면(`/challenge/[id]/dashboard` 등) 안에서 사진 인증 → 그 챌린지 action 직행.
- [ ] `/challenge/[id]/action`(인증 작성) 화면에서 FAB 미노출, 화면 내 "사진 찍기" 버튼은 정상.
- [ ] 헤더 우측에 그룹 아이콘 없음(알림벨·마이만), 로고→홈 정상.
- [ ] scrim 탭으로 메뉴 닫힘, 콘텐츠가 FAB 뒤로 가려지지 않음(하단 패딩).
- [ ] DevTools에서 `prefers-reduced-motion: reduce` 켜고 펼침이 즉각(애니메이션 없이) 전환.

- [ ] **Step 4: 수동 QA 결과를 PR 본문에 기록할 메모로 정리**(통과/이슈).

- [ ] **Step 5: (선택) 추가 커밋 없음** — 코드 변경이 없으면 커밋 생략. QA 중 수정 발생 시 해당 Task로 돌아가 TDD로 보강.

---

## 완료 기준(Definition of Done)

- spec의 모든 요구가 task로 매핑됨: FabMenu(T3) · 사진 인증 분기(T1) · 선택 시트(T2) · 헤더 그룹 제거(T4) · 레이아웃 배선/노출 범위(T5) · ActionFab 대체(T6) · 검증(T7).
- `pnpm typecheck && pnpm lint && pnpm test` 통과, 수동 QA 체크리스트 통과.
- Supabase/RLS/migration/AnalyticsEvent 변경 없음(가드레일 준수).
