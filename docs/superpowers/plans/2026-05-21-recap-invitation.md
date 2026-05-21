# Recap 정산 페이지 청첩장 리디자인 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (권장) 또는 `superpowers:executing-plans` 로 이 plan을 task 단위로 실행하세요. 모든 단계는 `- [ ]` 체크박스를 사용합니다.

**Goal:** 챌린지가 종료된 뒤 진입하는 `/challenge/[id]/recap`을 모바일 청첩장 톤(살구·아이보리)으로 리디자인하고, 1080×1080 PNG 공유 카드를 생성하는 Route Handler를 추가한다.

**Architecture:** 접근법 C(하이브리드) — 신규 청첩장 컴포넌트 6개로 본문을 구성하고 본인 정산 정보는 기존 컴포넌트를 흡수해 단일 `MyPenaltyCard`로 정리. 데이터 fetcher(`fetchRecap`)는 그대로 두고 사진 fetcher(`fetchChallengePhotos`) 하나만 추가. PNG는 Next.js 내장 `ImageResponse`(Node runtime) Route Handler.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Vitest + Testing Library · shadcn/ui (Dialog) · lucide-react (Crown) · Supabase RLS + Storage signed URL.

**Spec:** `docs/superpowers/specs/2026-05-21-recap-invitation-design.md`
**ADR:** `docs/adr/0014-route-handler-binary-response.md`
**Worktree:** `/Users/ian/gitlab/with-key-recap-invitation`
**Branch:** `feat/recap-invitation-design` (base `origin/develop`, 시작 커밋 `8f83160`)

---

## File Map

각 task가 생성·수정·삭제하는 파일 한눈 보기.

### 신규 (Create)

| 경로 | 책임 |
|---|---|
| `src/lib/db/reads/challenge-photos.ts` | 사진 fetcher · pure builder · signed URL 결합 |
| `src/lib/db/reads/challenge-photos.spec.ts` | builder 단위 테스트 (DB 비의존) |
| `src/app/(app)/challenge/[id]/recap/_components/invitation-header.tsx` | 청첩장 헤더 (server) |
| `src/app/(app)/challenge/[id]/recap/_components/invitation-header.spec.tsx` | 자동 카피 · 기간 포맷 |
| `src/app/(app)/challenge/[id]/recap/_components/photo-gallery.tsx` | 사진 그리드 + lightbox (client) |
| `src/app/(app)/challenge/[id]/recap/_components/photo-gallery.spec.tsx` | 0장 null · N장 그리드 |
| `src/app/(app)/challenge/[id]/recap/_components/member-roster.tsx` | 멤버 명단 청첩장 식 (server) |
| `src/app/(app)/challenge/[id]/recap/_components/member-roster.spec.tsx` | MVP 왕관 · 줄 정렬 |
| `src/app/(app)/challenge/[id]/recap/_components/settlement-account.tsx` | 그룹 계좌 카드 (server) |
| `src/app/(app)/challenge/[id]/recap/_components/settlement-account.spec.tsx` | 정상 표시 · null 가드 |
| `src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.tsx` | 본인 정산액 + 달성률 (server) |
| `src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.spec.tsx` | 달성·미달성 분기 |
| `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` | 결과 공유 + PNG 다운로드 (client) |
| `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx` | Web Share · 폴백 · PNG fetch mock |
| `src/app/api/og/recap-card/route.ts` | PNG ImageResponse Route Handler |
| `src/app/api/og/recap-card/route.spec.ts` | 401 · 404 · 200 응답 |

### 수정 (Modify)

| 경로 | 변경 |
|---|---|
| `src/app/(app)/challenge/[id]/recap/page.tsx` | 새 컴포넌트로 재구성 + `Promise.all` 병렬 fetch |
| `src/app/(app)/challenge/[id]/recap/_components/account-inline-prompt.tsx` | 살구 톤 색상만 교체 (props·로직 미변경) |
| `src/app/globals.css` | 청첩장 톤 변수 6개 추가 |

### 폐기 (Delete)

- `src/app/(app)/challenge/[id]/recap/_components/recap-hero.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-hero.spec.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-members-list.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-members-list.spec.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-end-card.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-stats-row.tsx`
- `src/app/(app)/challenge/[id]/recap/_components/recap-actions.tsx`

---

## Task 0: 워크트리 기준선 확인

**Files:** 없음 (환경 확인)

- [ ] **Step 1: 의존성 설치 + baseline 통과 확인**

```bash
cd /Users/ian/gitlab/with-key-recap-invitation
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Expected: 모두 PASS. 실패하면 본 작업과 무관한 변경이 develop에 있을 수 있으니 root cause 조사 후 별도 PR로 분리.

- [ ] **Step 2: 시작 commit + branch 확인**

```bash
git -C /Users/ian/gitlab/with-key-recap-invitation log --oneline -3
git -C /Users/ian/gitlab/with-key-recap-invitation branch --show-current
```

Expected:
```
8f83160 docs(recap): 청첩장 정산 페이지 spec + ADR-0014 + UI 가이드 §11-C/D
07b7340 Merge pull request #74 ...
...
feat/recap-invitation-design
```

---

## Task 1: `fetchChallengePhotos` fetcher

`action_logs`에서 `photo_path != null` 인 행을 시간순으로 가져오고, `getPhotoSignedUrls`로 signed URL 일괄 발급. pure builder를 분리해 단위 테스트 가능하게 한다.

**Files:**
- Create: `src/lib/db/reads/challenge-photos.ts`
- Test: `src/lib/db/reads/challenge-photos.spec.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`src/lib/db/reads/challenge-photos.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildChallengePhotosView } from "./challenge-photos";

describe("buildChallengePhotosView", () => {
  it("photo_path null 인 행은 제외", () => {
    const rows = [
      { id: "1", photo_path: "a.jpg", created_at: "2026-05-01T00:00:00Z", users: { display_name: "민지" } },
      { id: "2", photo_path: null, created_at: "2026-05-02T00:00:00Z", users: { display_name: "JJ" } },
    ];
    const signedUrls = ["https://signed/a.jpg", null];
    const view = buildChallengePhotosView(rows, signedUrls);
    expect(view).toHaveLength(1);
    expect(view[0].id).toBe("1");
  });

  it("display_name 누락 시 '익명' 폴백", () => {
    const rows = [
      { id: "1", photo_path: "a.jpg", created_at: "2026-05-01T00:00:00Z", users: { display_name: null } },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/a.jpg"]);
    expect(view[0].ownerDisplayName).toBe("익명");
  });

  it("signedUrl null 인 항목은 제외 (signed URL 발급 실패)", () => {
    const rows = [
      { id: "1", photo_path: "a.jpg", created_at: "2026-05-01T00:00:00Z", users: { display_name: "민지" } },
      { id: "2", photo_path: "b.jpg", created_at: "2026-05-02T00:00:00Z", users: { display_name: "JJ" } },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/a.jpg", null]);
    expect(view).toHaveLength(1);
    expect(view[0].id).toBe("1");
  });

  it("RecapPhotoView 모양으로 매핑 — id · signedUrl · takenAt · ownerDisplayName", () => {
    const rows = [
      { id: "x", photo_path: "p.jpg", created_at: "2026-05-05T12:00:00Z", users: { display_name: "희수" } },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/p.jpg"]);
    expect(view[0]).toEqual({
      id: "x",
      signedUrl: "https://signed/p.jpg",
      takenAt: "2026-05-05T12:00:00Z",
      ownerDisplayName: "희수",
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/ian/gitlab/with-key-recap-invitation && pnpm test -- challenge-photos
```

Expected: `Cannot find module './challenge-photos'` 또는 `buildChallengePhotosView is not exported`.

- [ ] **Step 3: builder + fetcher 구현**

`src/lib/db/reads/challenge-photos.ts`:

```ts
// src/lib/db/reads/challenge-photos.ts
import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPhotoSignedUrls } from "@/lib/storage/action-photos";

export type RecapPhotoView = {
  id: string;
  signedUrl: string;
  takenAt: string;
  ownerDisplayName: string;
};

type PhotoRow = {
  id: string;
  photo_path: string | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }>;
};

/** Pure mapper — DB 비의존. 단위 테스트 대상. */
export function buildChallengePhotosView(
  rows: ReadonlyArray<PhotoRow>,
  signedUrls: ReadonlyArray<string | null>,
): ReadonlyArray<RecapPhotoView> {
  const out: RecapPhotoView[] = [];
  rows.forEach((row, i) => {
    if (!row.photo_path) return;
    const url = signedUrls[i];
    if (!url) return;
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    out.push({
      id: row.id,
      signedUrl: url,
      takenAt: row.created_at,
      ownerDisplayName: author?.display_name ?? "익명",
    });
  });
  return out;
}

/** RLS가 그룹 멤버만 허용 → 비멤버는 빈 배열을 받음. */
export const fetchChallengePhotos = cache(
  async (
    challengeId: string,
    options: { client?: SupabaseClient } = {},
  ): Promise<ReadonlyArray<RecapPhotoView>> => {
    const supabase = options.client ?? (await createClient());
    const { data, error } = await supabase
      .from("action_logs")
      .select(["id", "photo_path", "created_at", "users!inner(display_name)"].join(","))
      .eq("challenge_id", challengeId)
      .not("photo_path", "is", null)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    const rows = data as unknown as PhotoRow[];
    const signedUrls = await getPhotoSignedUrls(
      rows.map((r) => r.photo_path),
      supabase,
    );
    return buildChallengePhotosView(rows, signedUrls);
  },
);
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test -- challenge-photos
```

Expected: 4 tests passed.

- [ ] **Step 5: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/reads/challenge-photos.ts src/lib/db/reads/challenge-photos.spec.ts
git commit -m "feat(recap): fetchChallengePhotos fetcher + builder 추가"
```

---

## Task 2: `InvitationHeader` 컴포넌트

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/invitation-header.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/invitation-header.spec.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`invitation-header.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InvitationHeader } from "./invitation-header";

describe("InvitationHeader", () => {
  const base = {
    groupName: "우리 그룹",
    title: "주 3회 헬스장",
    startAt: "2026-05-05T00:00:00Z",
    endAt: "2026-05-20T00:00:00Z",
    durationDays: 16,
  };

  it("그룹명 · 챌린지명 · 기간 일수를 자동 카피로 결합", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/우리 그룹의 주 3회 헬스장/)).toBeTruthy();
    expect(screen.getByText(/그 16일의 기록/)).toBeTruthy();
  });

  it("기간을 YYYY · MM · DD — MM · DD 포맷으로 표시", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/2026\s*·\s*05\s*·\s*05/)).toBeTruthy();
    expect(screen.getByText(/05\s*·\s*20/)).toBeTruthy();
  });

  it("A MEMOIR eyebrow 표시", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/A MEMOIR/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test -- invitation-header
```

Expected: `Cannot find module './invitation-header'`.

- [ ] **Step 3: 구현**

`invitation-header.tsx`:

```tsx
// src/app/(app)/challenge/[id]/recap/_components/invitation-header.tsx
type Props = {
  groupName: string;
  title: string;
  startAt: string;
  endAt: string;
  durationDays: number;
};

function fmtPart(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return withYear ? `${y} · ${m} · ${day}` : `${m} · ${day}`;
}

export function InvitationHeader({ groupName, title, startAt, endAt, durationDays }: Props) {
  const period = `${fmtPart(startAt, true)} — ${fmtPart(endAt, false)}`;
  return (
    <section className="bg-[var(--invite-bg,#FAF6EF)] text-[var(--invite-ink,#2A221C)] -mx-4 px-6 pt-6 pb-4 text-center">
      <p className="text-[10px] tracking-[0.35em] uppercase text-[var(--invite-accent,#B07A4D)]">
        A MEMOIR
      </p>
      <h2 className="mt-2 font-serif text-[17px] font-semibold leading-snug">
        {groupName}의 {title},<br />그 {durationDays}일의 기록
      </h2>
      <p className="mt-2 text-[10px] tracking-wider text-[var(--invite-muted,#5E4838)]">{period}</p>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test -- invitation-header
```

Expected: 3 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/invitation-header.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/invitation-header.spec.tsx
git commit -m "feat(recap): InvitationHeader 청첩장 헤더 컴포넌트 추가"
```

---

## Task 3: `PhotoGallery` 컴포넌트 (lightbox)

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/photo-gallery.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/photo-gallery.spec.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PhotoGallery } from "./photo-gallery";

const photos = [
  { id: "1", signedUrl: "https://sig/a.jpg", takenAt: "2026-05-05T00:00:00Z", ownerDisplayName: "민지" },
  { id: "2", signedUrl: "https://sig/b.jpg", takenAt: "2026-05-06T00:00:00Z", ownerDisplayName: "JJ" },
];

describe("PhotoGallery", () => {
  it("photos 가 0장이면 null (렌더 결과 비어 있음)", () => {
    const { container } = render(<PhotoGallery photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("N장이면 그리드 썸네일 N개 렌더", () => {
    render(<PhotoGallery photos={photos} />);
    expect(screen.getAllByRole("button", { name: /사진 보기/ })).toHaveLength(2);
  });

  it("썸네일 클릭 시 lightbox 열림 (작성자 표시)", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button", { name: /사진 보기/ })[0]);
    expect(screen.getByText("민지")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test -- photo-gallery
```

Expected: module not found.

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/photo-gallery.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { RecapPhotoView } from "@/lib/db/reads/challenge-photos";

type Props = { photos: ReadonlyArray<RecapPhotoView> };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function PhotoGallery({ photos }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (photos.length === 0) return null;
  const active = activeId ? photos.find((p) => p.id === activeId) ?? null : null;

  return (
    <section
      aria-label="챌린지 인증 사진"
      className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-2"
    >
      <ul className="grid grid-cols-3 gap-[3px]">
        {photos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-label={`사진 보기 — ${p.ownerDisplayName}`}
              onClick={() => setActiveId(p.id)}
              className="relative block aspect-square w-full overflow-hidden rounded-[3px]"
            >
              <Image
                src={p.signedUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 33vw, 200px"
                loading="lazy"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="max-w-screen-sm p-0">
          {active && (
            <figure className="flex flex-col">
              <div className="relative aspect-square w-full bg-black">
                <Image src={active.signedUrl} alt="" fill sizes="100vw" className="object-contain" />
              </div>
              <figcaption className="px-4 py-3 text-sm">
                <span className="font-semibold">{active.ownerDisplayName}</span>
                <span className="ml-2 text-[var(--invite-muted,#5E4838)]">{fmtDate(active.takenAt)}</span>
              </figcaption>
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test -- photo-gallery
```

Expected: 3 tests passed.

> shadcn `Dialog`가 jsdom 환경의 hover/portal 이슈로 실패하면, 테스트 파일 상단에 다음 mock 추가:
> ```ts
> vi.mock("@/components/ui/dialog", () => ({
>   Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <>{children}</> : null),
>   DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
> }));
> ```

- [ ] **Step 5: next.config 의 remotePatterns 확인 — Supabase signed URL 허용 여부**

```bash
grep -nE "remotePatterns|images:" /Users/ian/gitlab/with-key-recap-invitation/next.config.*
```

Expected: Supabase storage 도메인이 `remotePatterns`에 등록되어 있어야 함. 없으면 `next.config.ts`에 다음 추가:

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "<your-supabase-project>.supabase.co", pathname: "/storage/v1/object/sign/**" },
  ],
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/photo-gallery.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/photo-gallery.spec.tsx
git commit -m "feat(recap): PhotoGallery 그리드 + lightbox 컴포넌트 추가"
```

---

## Task 4: `MemberRoster` 컴포넌트

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/member-roster.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/member-roster.spec.tsx`

- [ ] **Step 1: 실패 테스트**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemberRoster } from "./member-roster";

describe("MemberRoster", () => {
  it("멤버 전원의 displayName 표시 (달성·미달성 차이 없음)", () => {
    render(
      <MemberRoster
        members={[
          { id: "a", displayName: "김주은", isMvp: false },
          { id: "b", displayName: "최소원", isMvp: false },
          { id: "c", displayName: "이성훈", isMvp: false },
          { id: "d", displayName: "박지민", isMvp: false },
        ]}
      />,
    );
    expect(screen.getByText("김주은")).toBeTruthy();
    expect(screen.getByText("박지민")).toBeTruthy();
  });

  it("동명이인이 있어도 key 충돌 없이 둘 다 렌더", () => {
    render(
      <MemberRoster
        members={[
          { id: "u1", displayName: "민지", isMvp: false },
          { id: "u2", displayName: "민지", isMvp: false },
        ]}
      />,
    );
    expect(screen.getAllByText("민지")).toHaveLength(2);
  });

  it("isMvp true 멤버 옆에 왕관 아이콘 (aria-label='MVP')", () => {
    render(<MemberRoster members={[{ id: "b", displayName: "JJ", isMvp: true }]} />);
    expect(screen.getByLabelText("MVP")).toBeTruthy();
  });

  it("멤버 0명이면 null", () => {
    const { container } = render(<MemberRoster members={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test -- member-roster
```

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/member-roster.tsx
import { Crown } from "lucide-react";

type Props = {
  members: ReadonlyArray<{ id: string; displayName: string; isMvp: boolean }>;
};

export function MemberRoster({ members }: Props) {
  if (members.length === 0) return null;
  return (
    <section
      aria-label="정산 멤버"
      className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-6 py-4 text-center text-[13px] leading-[1.85] text-[var(--invite-ink,#2A221C)]"
    >
      <div className="mb-2 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[var(--invite-accent,#B07A4D)]">
        <span className="h-px flex-1 bg-[var(--invite-line,#E5D8C2)]" />
        SETTLEMENT
        <span className="h-px flex-1 bg-[var(--invite-line,#E5D8C2)]" />
      </div>
      <ul className="grid grid-cols-2 gap-x-4">
        {members.map((m) => (
          <li key={m.id} className="font-semibold">
            {m.displayName}
            {m.isMvp && (
              <Crown
                aria-label="MVP"
                className="ml-1 inline-block h-3 w-3 align-[-1px] text-[var(--invite-gold,#C9A878)]"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test -- member-roster
```

Expected: 3 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/member-roster.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/member-roster.spec.tsx
git commit -m "feat(recap): MemberRoster 청첩장식 멤버 명단 + MVP 왕관"
```

---

## Task 5: `SettlementAccount` 컴포넌트

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/settlement-account.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/settlement-account.spec.tsx`

- [ ] **Step 1: 실패 테스트**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementAccount } from "./settlement-account";

describe("SettlementAccount", () => {
  it("세 값 모두 있으면 은행명 · 마스킹 번호 · 예금주 표시", () => {
    render(<SettlementAccount bankCode="088" holder="김주은" last4="1234" />);
    expect(screen.getByText(/신한/)).toBeTruthy();
    expect(screen.getByText(/\*\*\*\*1234/)).toBeTruthy();
    expect(screen.getByText(/김주은/)).toBeTruthy();
  });

  it("bankCode/holder/last4 중 하나라도 null 이면 null 렌더", () => {
    const { container: c1 } = render(<SettlementAccount bankCode={null} holder="x" last4="1234" />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<SettlementAccount bankCode="088" holder={null} last4="1234" />);
    expect(c2.firstChild).toBeNull();
    const { container: c3 } = render(<SettlementAccount bankCode="088" holder="x" last4={null} />);
    expect(c3.firstChild).toBeNull();
  });

  it("알 수 없는 bankCode 면 코드 자체 출력 (BANK_NAMES 폴백)", () => {
    render(<SettlementAccount bankCode="999" holder="x" last4="1234" />);
    expect(screen.getByText(/999/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test -- settlement-account
```

- [ ] **Step 3: 구현 — `BANK_NAMES`(`src/lib/bank/codes.ts`) 재사용**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/settlement-account.tsx
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";

type Props = {
  bankCode: string | null;
  holder: string | null;
  last4: string | null;
};

function bankLabel(code: string): string {
  return (BANK_NAMES as Record<string, string>)[code as BankCode] ?? code;
}

export function SettlementAccount({ bankCode, holder, last4 }: Props) {
  if (!bankCode || !holder || !last4) return null;
  return (
    <section
      aria-label="정산 계좌"
      className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-6 pb-6"
    >
      <p className="mt-3 rounded-[10px] border border-[var(--invite-line,#E5D8C2)] bg-white px-3 py-2 text-center text-[11px] text-[var(--invite-muted,#5E4838)]">
        {bankLabel(bankCode)} · ***-****{last4} ·{" "}
        <span className="font-semibold text-[var(--invite-ink,#2A221C)]">{holder}</span>
      </p>
    </section>
  );
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test -- settlement-account
```

Expected: 3 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/settlement-account.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/settlement-account.spec.tsx
git commit -m "feat(recap): SettlementAccount 그룹 계좌 카드 (null 가드 포함)"
```

---

## Task 6: `MyPenaltyCard` (기존 `RecapEndCard` + `RecapStatsRow` 흡수)

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.spec.tsx`

- [ ] **Step 1: 기존 두 컴포넌트 읽어서 흡수 범위 확인**

```bash
cat src/app/\(app\)/challenge/\[id\]/recap/_components/recap-end-card.tsx
cat src/app/\(app\)/challenge/\[id\]/recap/_components/recap-stats-row.tsx
```

`formatKRW` 같은 헬퍼는 `@/lib/challenge/penalty`에서 import.

- [ ] **Step 2: 실패 테스트**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MyPenaltyCard } from "./my-penalty-card";

describe("MyPenaltyCard", () => {
  it("viewerAchieved=true 시 정산 금액 없음 + 축하 카피", () => {
    render(
      <MyPenaltyCard
        doneCount={5}
        goalCount={3}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        totalPenalty={3000}
      />,
    );
    expect(screen.getByText(/축하해요/)).toBeTruthy();
    expect(screen.getByText(/5 \/ 3/)).toBeTruthy();
  });

  it("viewerAchieved=false 시 큰 ₩X + 진행도 표시", () => {
    render(
      <MyPenaltyCard
        doneCount={1}
        goalCount={3}
        viewerAchieved={false}
        viewerPerHeadPenalty={3000}
        totalPenalty={6000}
      />,
    );
    expect(screen.getByText(/3,000/)).toBeTruthy();
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm test -- my-penalty-card
```

- [ ] **Step 4: 구현**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.tsx
import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  doneCount: number;
  goalCount: number;
  viewerAchieved: boolean;
  viewerPerHeadPenalty: number;
  totalPenalty: number;
};

export function MyPenaltyCard({
  doneCount,
  goalCount,
  viewerAchieved,
  viewerPerHeadPenalty,
}: Props) {
  const ratio = Math.min(100, Math.round((doneCount / Math.max(1, goalCount)) * 100));
  return (
    <section className="bg-card rounded-2xl border border-border/60 p-3">
      <p className="text-[10px] tracking-wider text-muted-foreground uppercase">나의 정산</p>
      <div className="mt-1 flex items-baseline justify-between">
        {viewerAchieved ? (
          <p className="text-[15px] font-semibold text-foreground">축하해요! 정산할 금액 없음</p>
        ) : (
          <p className="text-[22px] font-bold text-foreground">
            {formatKRW(viewerPerHeadPenalty)}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {doneCount} / {goalCount}회
        </p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${ratio}%` }} />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm test -- my-penalty-card
```

Expected: 2 tests passed.

- [ ] **Step 6: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/my-penalty-card.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/my-penalty-card.spec.tsx
git commit -m "feat(recap): MyPenaltyCard — RecapEndCard + RecapStatsRow 흡수"
```

---

## Task 7: `ShareCardAction` (기존 `RecapActions` 흡수 + PNG 다운로드)

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`

- [ ] **Step 1: 기존 `RecapActions` 의 Web Share 로직 확인**

```bash
cat src/app/\(app\)/challenge/\[id\]/recap/_components/recap-actions.tsx
```

`navigator.share` + 클립보드 폴백 로직 그대로 이전.

- [ ] **Step 2: 실패 테스트**

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareCardAction } from "./share-card-action";

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("[결과 공유] 버튼 클릭 시 navigator.share 호출", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "결과 공유" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: "with-key 결과", text: "hello" }),
    );
  });

  it("[공유 카드 저장] 버튼 클릭 시 /api/og/recap-card fetch", async () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 카드 저장" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/og/recap-card?challengeId=c1"),
    );
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm test -- share-card-action
```

- [ ] **Step 4: 구현**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { toast } from "sonner";

type Props = { challengeId: string; shareMessage: string };

async function shareResult(message: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "with-key 결과", text: message });
      return;
    } catch {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    toast.success("결과 메시지를 복사했어요");
  } catch {
    toast.error("공유에 실패했어요. 다시 시도해 주세요.");
  }
}

async function downloadCard(challengeId: string): Promise<void> {
  try {
    const res = await fetch(`/api/og/recap-card?challengeId=${challengeId}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `recap-${challengeId}.png`, { type: "image/png" });

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] }) &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({ files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("공유 카드 생성에 실패했어요.");
  }
}

export function ShareCardAction({ challengeId, shareMessage }: Props) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => void shareResult(shareMessage)}
        className="border-border/60 bg-card flex-1 rounded-full border py-3 text-[13px] font-semibold transition-transform active:scale-95"
      >
        결과 공유
      </button>
      <button
        type="button"
        onClick={() => void downloadCard(challengeId)}
        className="bg-primary text-primary-foreground flex-1 rounded-full py-3 text-[13px] font-semibold transition-transform active:scale-95"
      >
        공유 카드 저장
      </button>
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm test -- share-card-action
```

Expected: 2 tests passed.

- [ ] **Step 6: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/share-card-action.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/share-card-action.spec.tsx
git commit -m "feat(recap): ShareCardAction — 결과 공유 + PNG 카드 다운로드"
```

---

## Task 8: PNG `ImageResponse` Route Handler

**Files:**
- Create: `src/app/api/og/recap-card/route.ts`
- Test: `src/app/api/og/recap-card/route.spec.ts`

- [ ] **Step 1: Pretendard 자산 확인**

```bash
ls /Users/ian/gitlab/with-key-recap-invitation/public/fonts/
```

Expected: `PretendardVariable.woff2` 존재 (with-key 기본 자산). Satori v0.10+가 woff2를 지원하지만 일부 케이스에서 가변 폰트 weight 매핑 이슈가 보고됨 — 본 task의 fonts 옵션 weight를 `400`(Regular)로 두고 동작 확인. 사각형 깨짐 발생 시 Pretendard-1.3.x 릴리스의 `Pretendard-Bold.otf` 또는 `Pretendard-Regular.otf`를 별도 추가하고 weight 맞춤. 자산 부재 시 `font` undefined → 한글 사각형 깨짐 확실 — 절대 묵시적으로 진행 금지.

- [ ] **Step 2: 실패 통합 테스트**

```ts
// src/app/api/og/recap-card/route.spec.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor() {
      super(new Blob(["png"], { type: "image/png" }), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
  },
}));

const { GET } = await import("./route");
const { createClient } = await import("@/lib/supabase/server");
const { fetchRecap } = await import("@/lib/db/reads/recap");

function buildReq(challengeId: string): Request {
  return new Request(`http://t/api/og/recap-card?challengeId=${challengeId}`);
}

describe("GET /api/og/recap-card", () => {
  it("미인증 시 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(401);
  });

  it("멤버 아님 또는 active 챌린지 시 404", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    });
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(404);
  });

  it("정상 — image/png Content-Type", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    });
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue({
      challengeId: "c1",
      title: "주 3회 헬스장",
      status: "closed",
      startAt: "2026-05-05T00:00:00Z",
      endAt: "2026-05-20T00:00:00Z",
      durationDays: 16,
      members: [{ id: "u1", displayName: "민지", isMvp: false }],
      group: {
        id: "g1",
        name: "우리 그룹",
        ownerId: "u1",
        bankCode: "088",
        accountHolder: "민지",
        accountNumberLast4: "1234",
      },
    });
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm test -- route.spec
```

- [ ] **Step 4: 구현 — 한글 폰트 등록 + 가드 + ImageResponse**

```tsx
// src/app/api/og/recap-card/route.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";

export const runtime = "nodejs";

let fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts/PretendardVariable.woff2"));
    fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return fontCache;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap || recap.status !== "closed") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const font = await loadFont();
  const bankLabel = recap.group?.bankCode
    ? (BANK_NAMES as Record<string, string>)[recap.group.bankCode as BankCode] ?? recap.group.bankCode
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FAF6EF",
          color: "#2A221C",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "80px 64px",
        }}
      >
        {/* Satori: 모든 div 는 display: flex 필수. text-only div 도 명시. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 12, color: "#B07A4D" }}>
            WITH-KEY
          </div>
          <div style={{ display: "flex", fontSize: 28, marginTop: 24, color: "#5E4838" }}>
            {recap.group?.name ?? "우리 그룹"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              marginTop: 16,
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {recap.title}
          </div>
          <div style={{ display: "flex", fontSize: 24, marginTop: 24, color: "#5E4838" }}>
            그 {recap.durationDays}일의 기록
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px 36px",
            justifyContent: "center",
            fontSize: 36,
          }}
        >
          {recap.members.map((m) => (
            <div key={m.id} style={{ display: "flex" }}>
              {m.displayName}
              {m.isMvp ? " ♛" : ""}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 22,
            color: "#5E4838",
          }}
        >
          {bankLabel && recap.group?.accountNumberLast4 && (
            <div style={{ display: "flex" }}>
              {bankLabel} ***-****{recap.group.accountNumberLast4} · {recap.group.accountHolder}
            </div>
          )}
          <div style={{ display: "flex", color: "#B07A4D", marginTop: 8 }}>
            {recap.startAt?.slice(0, 10).replaceAll("-", " · ")} —{" "}
            {recap.endAt?.slice(5, 10).replace("-", " · ")}
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: font
        ? [{ name: "Pretendard", data: font, weight: 400, style: "normal" as const }]
        : undefined,
      headers: { "Cache-Control": "private, max-age=300" },
    },
  );
}
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm test -- route.spec
```

Expected: 3 tests passed.

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/og/recap-card/route.ts src/app/api/og/recap-card/route.spec.ts
git commit -m "feat(api): /api/og/recap-card PNG ImageResponse 라우트 추가 (ADR-0014)"
```

---

## Task 9: `account-inline-prompt` 살구 톤 교체

기존 props·로직 보존, CSS 클래스만 청첩장 톤으로 교체. 별도 신규 테스트 없음(기존 props 미변경).

**Files:**
- Modify: `src/app/(app)/challenge/[id]/recap/_components/account-inline-prompt.tsx`

- [ ] **Step 1: 현재 컴포넌트 읽기**

```bash
cat src/app/\(app\)/challenge/\[id\]/recap/_components/account-inline-prompt.tsx
```

- [ ] **Step 2: 컴포넌트의 최상위 wrapper 와 강조 텍스트의 className 만 청첩장 톤으로 수정**

기존 wrapper 의 `bg-card border-border` 같은 클래스를 다음으로 치환:

```tsx
className="bg-white border border-[var(--invite-line,#E5D8C2)] rounded-[10px] px-3 py-2.5 text-[11px] text-[var(--invite-muted,#5E4838)] flex items-center gap-2"
```

링크 강조(`text-primary`)는 `text-[var(--invite-accent,#B07A4D)]`로 치환.

다른 props/로직/접근성 라벨은 손대지 않음.

- [ ] **Step 3: typecheck/lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/_components/account-inline-prompt.tsx
git commit -m "refactor(recap): account-inline-prompt 살구 톤 교체"
```

---

## Task 10: globals.css 에 청첩장 톤 변수 추가

UI 가이드 §11-C/D 와 동일한 6개 변수를 앱 globals.css 에도 등록해 컴포넌트의 `var(--invite-*)` fallback 이 실제 토큰을 가리키도록 한다.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 현재 :root 끝 위치 확인**

```bash
grep -n "^:root\|^}" src/app/globals.css | head -10
```

- [ ] **Step 2: `:root` 블록 끝 직전에 6개 변수 추가**

```css
/* 청첩장 정산 (recap §11-C/D) */
--invite-bg: #FAF6EF;
--invite-ink: #2A221C;
--invite-muted: #5E4838;
--invite-accent: #B07A4D;
--invite-gold: #C9A878;
--invite-line: #E5D8C2;
```

- [ ] **Step 3: typecheck/lint + 시각 확인 (dev 서버)**

```bash
pnpm typecheck && pnpm lint
pnpm dev  # 별도 터미널: http://localhost:3000 모바일 viewport 진입
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css
git commit -m "chore(style): 청첩장 정산 톤 6개 토큰을 globals.css 에 등록"
```

---

## Task 11: `recap/page.tsx` 재구성

신규 컴포넌트 import + `Promise.all` 사진 fetch + 기존 폐기 컴포넌트 import 제거.

**Files:**
- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`
- (조건부) Modify: `src/lib/db/reads/recap.ts` — `group.name` 미존재 시 추가

- [ ] **Step 1: 현재 page.tsx 의 전체 import 와 본문 구조 다시 읽기**

```bash
cat src/app/\(app\)/challenge/\[id\]/recap/page.tsx
```

- [ ] **Step 2: `recap.group.name` 필드 존재 여부 사전 확인**

```bash
grep -nE "name\b|RecapGroupView" src/lib/db/reads/recap.ts | head -10
```

`name`이 없으면 본 task 내에서 `RecapGroupView` 타입에 `name: string` 추가 + `groups!inner(name, ...)` select 절 보강. (spec 의 "fetchRecap 변경 없음"은 데이터 contract 보존이지만 단일 컬럼 추가는 허용)

- [ ] **Step 3: 새 구조로 재작성**

```tsx
// src/app/(app)/challenge/[id]/recap/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { track } from "@/lib/analytics/track";
import { formatKRW } from "@/lib/challenge/penalty";
import { AccountInlinePrompt } from "./_components/account-inline-prompt";
import { InvitationHeader } from "./_components/invitation-header";
import { PhotoGallery } from "./_components/photo-gallery";
import { MemberRoster } from "./_components/member-roster";
import { SettlementAccount } from "./_components/settlement-account";
import { MyPenaltyCard } from "./_components/my-penalty-card";
import { ShareCardAction } from "./_components/share-card-action";

type Params = Promise<{ id: string }>;

export default async function RecapPage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [recap, photos] = await Promise.all([
    fetchRecap(user.id, { challengeId }),
    fetchChallengePhotos(challengeId, { client: supabase }),
  ]);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="t-h2">주간 정산</h1>
        <p className="t-sub break-keep">
          아직 결과가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href={`/challenge/${challengeId}`}
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          챌린지로 가기
        </Link>
      </div>
    );
  }

  void track(
    { name: "penalty_displayed", props: { amount: recap.viewerPerHeadPenalty } },
    { userId: user.id },
  );

  const isOwner = recap.group?.ownerId === user.id;
  const hasAccount = !!(
    recap.group?.bankCode &&
    recap.group?.accountHolder &&
    recap.group?.accountNumberLast4
  );
  const totalPenalty = recap.members.reduce(
    (sum, m) => sum + (m.achieved ? 0 : recap.penaltyAmount),
    0,
  );
  const isSolo = recap.members.length === 1;
  const groupName = recap.group?.name ?? "우리 그룹";
  const shareMessage = `${recap.title} 종료! 최종 벌금 ${formatKRW(totalPenalty)} · with-key`;

  return (
    <div className="flex flex-col gap-4 p-4">
      {recap.group && !hasAccount && (
        <AccountInlinePrompt
          groupId={recap.group.id}
          isOwner={isOwner}
          bankCode={recap.group.bankCode}
          accountHolder={recap.group.accountHolder}
        />
      )}

      <MyPenaltyCard
        doneCount={recap.viewerDoneCount}
        goalCount={recap.goalCount}
        viewerAchieved={recap.viewerAchieved}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
        totalPenalty={totalPenalty}
      />

      {!isSolo && recap.startAt && recap.endAt && (
        <>
          <InvitationHeader
            groupName={groupName}
            title={recap.title}
            startAt={recap.startAt}
            endAt={recap.endAt}
            durationDays={recap.durationDays}
          />
          <PhotoGallery photos={photos} />
          <MemberRoster
            members={recap.members.map((m) => ({ id: m.id, displayName: m.displayName, isMvp: m.isMvp }))}
          />
          <SettlementAccount
            bankCode={recap.group?.bankCode ?? null}
            holder={recap.group?.accountHolder ?? null}
            last4={recap.group?.accountNumberLast4 ?? null}
          />
        </>
      )}

      <ShareCardAction challengeId={challengeId} shareMessage={shareMessage} />
    </div>
  );
}
```

- [ ] **Step 4: AccountInlinePrompt props 시그니처 재확인 (필요 시 보강)**

```bash
grep -nE "interface|type Props|export function AccountInlinePrompt" src/app/\(app\)/challenge/\[id\]/recap/_components/account-inline-prompt.tsx
```

기존 props 와 page.tsx 호출이 일치하는지 — 불일치 시 page.tsx 호출 인자만 맞추기.

- [ ] **Step 5: 모바일 viewport 수동 확인**

```bash
pnpm dev
# 다른 터미널: closed 챌린지 페이지를 모바일 viewport(375×667) 로 진입해 청첩장 본문 노출 + 사진 탭→lightbox + 공유 카드 저장 확인
```

- [ ] **Step 6: typecheck/lint/test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 7: 커밋**

```bash
git add src/app/\(app\)/challenge/\[id\]/recap/page.tsx src/lib/db/reads/recap.ts
git commit -m "feat(recap): page.tsx 청첩장 컴포넌트로 재구성 + 사진 병렬 fetch"
```

---

## Task 12: 폐기 컴포넌트 + spec 삭제

신규 page.tsx 가 더 이상 import 하지 않는 5개 컴포넌트와 2개 spec 파일 삭제.

**Files:**
- Delete: `recap-hero.tsx` · `recap-hero.spec.tsx` · `recap-members-list.tsx` · `recap-members-list.spec.tsx` · `recap-end-card.tsx` · `recap-stats-row.tsx` · `recap-actions.tsx`

- [ ] **Step 1: 다른 곳에서 import 하지 않는지 grep**

```bash
grep -rn "recap-hero\|recap-members-list\|recap-end-card\|recap-stats-row\|recap-actions" src/ --include="*.tsx" --include="*.ts"
```

Expected: 결과 없음(또는 자기 자신만). 결과가 있으면 해당 import 를 먼저 정리.

- [ ] **Step 2: 파일 삭제**

```bash
cd /Users/ian/gitlab/with-key-recap-invitation
git rm src/app/\(app\)/challenge/\[id\]/recap/_components/recap-hero.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-hero.spec.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-members-list.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-members-list.spec.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-end-card.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-stats-row.tsx \
       src/app/\(app\)/challenge/\[id\]/recap/_components/recap-actions.tsx
```

- [ ] **Step 3: 전체 검증**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 모든 게이트 통과. dead import 없음.

- [ ] **Step 4: 커밋**

```bash
git commit -m "refactor(recap): 폐기된 recap-hero/members-list/end-card/stats-row/actions 제거"
```

---

## Task 13: 통합 검증 + PR 생성

**Files:** 없음 (검증 + 메타)

- [ ] **Step 1: 전체 검증**

```bash
cd /Users/ian/gitlab/with-key-recap-invitation
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: 모두 PASS.

- [ ] **Step 2: 모바일 viewport 수동 시나리오 확인**

다음 케이스 모두 모바일 viewport(375×667 또는 실기)로 확인:

1. closed 챌린지 진입 → 청첩장 본문(헤더·갤러리·멤버·계좌) 4섹션 모두 노출
2. 사진 0장 챌린지 → 갤러리 섹션 숨김, 헤더 → 멤버 흐름 자연스러움
3. 1명 챌린지(`isSolo`) → 청첩장 본문 X, `MyPenaltyCard` + `ShareCardAction`만
4. 계좌 미등록 그룹 → 위 `AccountInlinePrompt` 노출(살구), 아래 `SettlementAccount` 숨김
5. 갤러리 썸네일 탭 → lightbox 풀스크린, 작성자·날짜 캡션
6. "공유 카드 저장" 탭 → PNG 다운로드(또는 Web Share API)
7. 미달성 viewer → `MyPenaltyCard` 큰 ₩ 표시
8. 달성 viewer → "축하해요! 정산할 금액 없음"

- [ ] **Step 3: 변경 commit 그래프 확인 + push**

```bash
git -C /Users/ian/gitlab/with-key-recap-invitation log --oneline origin/develop..HEAD
git -C /Users/ian/gitlab/with-key-recap-invitation push -u origin feat/recap-invitation-design
```

- [ ] **Step 4: PR 생성 (base = develop, 한국어 본문)**

```bash
gh pr create --base develop --title "feat(recap): 청첩장 톤 정산 페이지 + PNG 공유 카드" --body "$(cat <<'EOF'
## Summary

- 챌린지 종료 후 진입하는 `/challenge/[id]/recap` 을 모바일 청첩장 톤(살구·아이보리)으로 리디자인
- 본문 4섹션: `InvitationHeader` · `PhotoGallery`(lightbox) · `MemberRoster`(MVP 왕관) · `SettlementAccount`
- 본인 정산 카드(`MyPenaltyCard`)·결과 공유 카드(`ShareCardAction`)는 with-key 톤 유지
- 신규 `/api/og/recap-card` Route Handler — 1080×1080 PNG 공유 카드 (Next.js `ImageResponse`)
- 기존 5개 컴포넌트 폐기(`recap-hero` · `recap-members-list` · `recap-end-card` · `recap-stats-row` · `recap-actions`)

## Spec / ADR

- spec: `docs/superpowers/specs/2026-05-21-recap-invitation-design.md`
- ADR-0014: `docs/adr/0014-route-handler-binary-response.md` — 바이너리 응답 Route Handler 허용 결정
- UI 가이드 §11-C(청첩장 풀 페이지) + §11-D(공유 카드 PNG) frame 추가

## 가드레일

- [x] Server Action 일원화 — 신규 라우트는 ADR-0014 예외(바이너리 응답)
- [x] `useEffect` + `fetch` 쓰기 없음 (RSC + Server Action 유지)
- [x] zod SoT / `any` 미사용
- [x] RLS 정책 변경 없음 — 기존 `action_logs` RLS 자연 가드
- [x] 키워드 풀 · AnalyticsEvent · migration 변경 없음

## Verification

- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` 모두 PASS
- 모바일 viewport 8개 시나리오 수동 확인
- PNG 카드 다운로드 + Web Share API 동작 확인

## Rollback

- 신규 컴포넌트 6 + 라우트 1 + fetcher 1 삭제, 폐기 5 컴포넌트 git revert
- DB·migration 변경 없으므로 데이터 롤백 X
EOF
)"
```

- [ ] **Step 5: PR URL 사용자에게 공유**

---

## Self-Review (작성자 점검)

작성 후 spec 대조 결과:

**Spec 커버리지**
- 신규 컴포넌트 6: Task 2(InvitationHeader)·3(PhotoGallery)·4(MemberRoster)·5(SettlementAccount)·6(MyPenaltyCard)·7(ShareCardAction) ✓
- 신규 fetcher 1: Task 1 ✓
- 신규 라우트 1: Task 8 ✓
- 신규 ADR 1: 이미 커밋 `8f83160` ✓
- 수정 page.tsx: Task 11 ✓
- 수정 account-inline-prompt: Task 9 ✓
- UI 가이드 mockup: 이미 커밋 `8f83160` ✓
- 폐기 5 컴포넌트 + spec 2: Task 12 ✓
- 청첩장 톤 토큰 globals.css 등록: Task 10 ✓ (spec File Map 보강사항)

**Placeholder 스캔**: TBD/TODO/"적절한 에러 처리" 등 없음 ✓

**타입 일관성**:
- `RecapPhotoView`(Task 1) ↔ `PhotoGallery` Props(Task 3) ↔ `fetchChallengePhotos` 반환(Task 1) 일치 ✓
- `MyPenaltyCard` Props 5개 필드 ↔ page.tsx 호출(Task 11) 일치 ✓
- `MemberRoster` Props `{ displayName, isMvp }` ↔ page.tsx `.map()` 변환(Task 11) 일치 ✓

**남은 위험**
- `recap.group.name` 필드가 fetcher 반환에 없을 가능성 — Task 11 Step 2 사전 확인 + 보강 가이드 명시.
- `next/og` `ImageResponse` 의 jsdom 단위 테스트 환경 비호환 — Task 8 Step 2 에서 `vi.mock("next/og", ...)`로 우회 가이드 제공.
- Pretendard ttf 자산 없음 — Task 8 Step 1 에서 사전 확인 + 폴백(font 옵션 undefined) 처리.

---

## Execution Handoff

Plan 작성 및 커밋 완료. 두 가지 실행 방식 중 선택:

**1. Subagent-Driven (recommended)** — task마다 fresh subagent 디스패치, task 사이에 리뷰. 빠른 iteration.

**2. Inline Execution** — 현 세션에서 `executing-plans`로 batch 실행, 체크포인트마다 리뷰.

**어느 쪽으로 진행할까요?**
