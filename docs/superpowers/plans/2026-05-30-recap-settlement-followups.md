# 정산 페이지 후속 5건 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정산 페이지(`/challenge/[id]/recap`)에 계좌 복사(1탭) · 미리보기 데드락 수정 · 형식 순서/기본값 변경 · 영상 통일 레이아웃 · 공유물 랜덤 사진(미리보기=공유물 일치) 5건을 적용한다.

**Architecture:** 기존 자산 재사용 위주의 외과적 변경. 복사는 기존 `revealAccountNumber` Server Action을 공용 훅으로 추출해 재사용. 랜덤은 페이지가 요청당 `seed`를 1회 정해 미리보기·공유 URL에 함께 실어 결정적 선택(같은 seed→같은 사진)으로 미리보기와 실제 공유물을 일치시킨다. 데이터/RLS/마이그레이션 무변경.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Vitest(jsdom) · `next/og`(Satori) · Tailwind · lucide-react · sonner.

**스펙 SoT:** [`docs/superpowers/specs/2026-05-30-recap-settlement-followups.md`](../specs/2026-05-30-recap-settlement-followups.md)

---

## File Structure

신규:
- `src/lib/share/seeded-pick.ts` — 결정적 PRNG 기반 `pickOne`/`sample` (순수).
- `src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts` — 계좌 복사 공용 훅.
- `src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx` — 영수증용 텍스트 복사 버튼.

수정:
- `src/lib/db/reads/challenge-photos.ts` — `ownerId` 필드 추가.
- `src/app/api/og/recap-card/route.tsx` — `seed`로 "내 사진" 픽(폴백 포함).
- `src/app/api/share/recap-clip/route.ts` — 몽타주 사진카드 레이아웃 + `seed` 샘플 + 엔드카드 내 사진.
- `src/app/api/share/recap-clip/storyboard.ts` — `MAX_MONTAGE` export.
- `src/app/api/share/recap-clip/frames.tsx` — `renderMontageFrame` 제거.
- `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx` — 복사 로직을 훅 호출로 교체.
- `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` — `groupId` prop + 복사 버튼.
- `src/app/(app)/challenge/[id]/recap/page.tsx` — `groupId`·`seed` 전달.
- `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — 순서·기본값·데드락·seed.

작업 디렉터리: **워크트리 `/Users/ian/gitlab/with-key-recap-followups`** (브랜치 `feat/recap-settlement-followups`). 모든 `pnpm`·`git` 명령은 이 디렉터리에서 실행한다.

---

## Task 1: seeded-pick 헬퍼 (E 토대)

**Files:**
- Create: `src/lib/share/seeded-pick.ts`
- Test: `src/lib/share/seeded-pick.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/share/seeded-pick.spec.ts
import { describe, it, expect } from "vitest";
import { pickOne, sample } from "./seeded-pick";

describe("pickOne", () => {
  it("빈 배열이면 null", () => {
    expect(pickOne([], 1)).toBeNull();
  });
  it("같은 seed면 같은 결과(결정적)", () => {
    const arr = ["a", "b", "c", "d", "e"];
    expect(pickOne(arr, 42)).toBe(pickOne(arr, 42));
  });
  it("seed가 다르면 (대개) 다른 결과", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const results = new Set([1, 2, 3, 4, 5].map((s) => pickOne(arr, s)));
    expect(results.size).toBeGreaterThan(1);
  });
  it("항상 배열 원소를 반환", () => {
    const arr = ["a", "b", "c"];
    for (let s = 0; s < 20; s += 1) expect(arr).toContain(pickOne(arr, s));
  });
});

describe("sample", () => {
  it("n개를 반환(배열보다 작을 때)", () => {
    expect(sample(["a", "b", "c", "d", "e"], 3, 7)).toHaveLength(3);
  });
  it("배열보다 n이 크면 전체 길이", () => {
    expect(sample(["a", "b"], 6, 7)).toHaveLength(2);
  });
  it("같은 seed면 같은 순서(결정적)", () => {
    const arr = ["a", "b", "c", "d", "e", "f"];
    expect(sample(arr, 4, 99)).toEqual(sample(arr, 4, 99));
  });
  it("원본을 변형하지 않음(불변)", () => {
    const arr = ["a", "b", "c"];
    sample(arr, 2, 5);
    expect(arr).toEqual(["a", "b", "c"]);
  });
  it("반환 원소는 모두 원본에 존재", () => {
    const arr = ["a", "b", "c", "d"];
    for (const x of sample(arr, 3, 11)) expect(arr).toContain(x);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/share/seeded-pick.spec.ts`
Expected: FAIL — `Cannot find module "./seeded-pick"`.

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/share/seeded-pick.ts
// 결정적 PRNG(mulberry32) — 같은 seed면 같은 결과. 공유물 사진 선택을
// 미리보기와 실제 공유 파일에서 동일하게 만들기 위함(스펙 D-E).

/** 32-bit 정수 seed → [0,1) 의사난수 생성기. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seed 로 배열에서 1개를 결정적으로 고른다. 빈 배열이면 null. */
export function pickOne<T>(arr: ReadonlyArray<T>, seed: number): T | null {
  if (arr.length === 0) return null;
  const rng = mulberry32(seed);
  return arr[Math.floor(rng() * arr.length)];
}

/** seed 로 배열을 결정적으로 섞어(Fisher–Yates) 앞 n개를 돌려준다. 원본 불변. */
export function sample<T>(arr: ReadonlyArray<T>, n: number, seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/share/seeded-pick.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/share/seeded-pick.ts src/lib/share/seeded-pick.spec.ts
git commit -m "feat(share): 결정적 seeded-pick(pickOne·sample) 헬퍼 추가"
```

---

## Task 2: challenge-photos read 에 ownerId 추가 (E 토대)

**Files:**
- Modify: `src/lib/db/reads/challenge-photos.ts`
- Test: `src/lib/db/reads/challenge-photos.spec.ts`

- [ ] **Step 1: 테스트 갱신 (ownerId 매핑 단언)**

`challenge-photos.spec.ts` 의 마지막 매핑 테스트(현재 `toEqual` 4필드)를 아래로 교체하고, 그 위 row 들에 `user_id` 를 추가한다. 교체 대상은 `it("RecapPhotoView 모양으로 매핑 ...")` 블록:

```ts
  it("RecapPhotoView 모양으로 매핑 — id · signedUrl · takenAt · ownerDisplayName · ownerId", () => {
    const rows = [
      {
        id: "x",
        user_id: "u-9",
        photo_path: "p.jpg",
        created_at: "2026-05-05T12:00:00Z",
        users: { display_name: "희수" },
      },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/p.jpg"]);
    expect(view[0]).toEqual({
      id: "x",
      signedUrl: "https://signed/p.jpg",
      takenAt: "2026-05-05T12:00:00Z",
      ownerDisplayName: "희수",
      ownerId: "u-9",
    });
  });
```

추가로 위쪽 3개 테스트의 row 객체에도 `user_id: "u-1"`(임의)을 한 줄씩 더해 타입을 만족시킨다. 예: 각 row 의 `id:` 다음 줄에 `user_id: "u-1",` 추가.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/lib/db/reads/challenge-photos.spec.ts`
Expected: FAIL — 매핑 결과에 `ownerId` 없음(`toEqual` 불일치).

- [ ] **Step 3: 구현 — read 에 user_id/ownerId 추가**

`challenge-photos.ts` 에서 네 곳을 수정한다.

(1) `RecapPhotoView` 타입에 필드 추가:

```ts
export type RecapPhotoView = {
  id: string;
  signedUrl: string;
  takenAt: string;
  ownerDisplayName: string;
  ownerId: string;
};
```

(2) `PhotoRow` 타입에 `user_id` 추가:

```ts
type PhotoRow = {
  id: string;
  user_id: string;
  photo_path: string | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }>;
};
```

(3) `buildChallengePhotosView` 의 `out.push({...})` 에 `ownerId` 매핑 추가:

```ts
    out.push({
      id: row.id,
      signedUrl: url,
      takenAt: row.created_at,
      ownerDisplayName: author?.display_name ?? "익명",
      ownerId: row.user_id,
    });
```

(4) `fetchChallengePhotos` 의 `.select([...])` 배열에 `"user_id"` 추가:

```ts
      .select(
        [
          "id",
          "user_id",
          "photo_path",
          "created_at",
          "users!action_logs_user_id_fkey!inner(display_name)",
        ].join(","),
      )
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/lib/db/reads/challenge-photos.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/reads/challenge-photos.ts src/lib/db/reads/challenge-photos.spec.ts
git commit -m "feat(reads): challenge-photos 에 ownerId(업로더 user_id) 노출"
```

---

## Task 3: OG recap-card 라우트 — seed 기반 "내 사진" 선택 (E)

**Files:**
- Modify: `src/app/api/og/recap-card/route.tsx`
- Test: `src/app/api/og/recap-card/route.spec.ts`

- [ ] **Step 1: 테스트 추가 (내 사진 픽 + 폴백)**

`route.spec.ts` 의 `const { fetchRecap } = ...`(line 25) 다음에 두 핸들을 추가:

```ts
const { fetchChallengePhotos } = await import("@/lib/db/reads/challenge-photos");
const { duotoneDataUrl } = await import("@/lib/share/hero-image");
```

그리고 `describe` 내부 끝에 추가:

```ts
  it("template=ticket → 내 사진(u1) 중 seed로 골라 duotone 적용", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "p1", signedUrl: "https://s/p1.jpg", takenAt: "t", ownerDisplayName: "나", ownerId: "u1" },
      { id: "p2", signedUrl: "https://s/p2.jpg", takenAt: "t", ownerDisplayName: "남", ownerId: "u2" },
    ]);
    const res = await GET(buildReq("challengeId=c1&template=ticket&seed=1"));
    expect(res.status).toBe(200);
    // 내 사진(u1=p1)만 후보 → 단일 후보라 seed 무관하게 p1 선택 → duotone 호출.
    expect(duotoneDataUrl).toHaveBeenCalledWith("https://s/p1.jpg");
  });

  it("내 사진 0장이면 전체 사진에서 고른다(fallback)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "p2", signedUrl: "https://s/p2.jpg", takenAt: "t", ownerDisplayName: "남", ownerId: "u2" },
    ]);
    const res = await GET(buildReq("challengeId=c1&template=ticket&seed=3"));
    expect(res.status).toBe(200);
    expect(duotoneDataUrl).toHaveBeenCalledWith("https://s/p2.jpg");
  });
```

> 주의: 두 테스트의 사진 URL(p1.jpg / p2.jpg)이 서로 달라 `toHaveBeenCalledWith` 누적 매칭이 교차 오염되지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/og/recap-card/route.spec.ts`
Expected: 신규 단언/ import 도입으로 RED(현재 라우트엔 seed·ownerId 픽 로직 없음). 실패 메시지 확인 후 진행.

- [ ] **Step 3: 구현 — seed 기반 내 사진 픽**

`route.tsx` 상단 import 에 추가:

```ts
import { pickOne } from "@/lib/share/seeded-pick";
```

`GET` 안에서 photos/heroUrl 계산부를 교체한다. 기존:

```ts
  const photos = await fetchChallengePhotos(challengeId, { client: supabase });
  const latest = photos.length > 0 ? photos[photos.length - 1].signedUrl : null;
  const heroUrl = latest ? (template === "ticket" ? await duotoneDataUrl(latest) : latest) : null;
```

교체 후:

```ts
  const seed = Number(url.searchParams.get("seed")) || 0;
  const photos = await fetchChallengePhotos(challengeId, { client: supabase });
  // 내 사진 우선 → 없으면 전체 → 없으면 null (D-E)
  const mine = photos.filter((p) => p.ownerId === user.id);
  const picked = pickOne(mine.length > 0 ? mine : photos, seed);
  const heroUrl = picked
    ? template === "ticket"
      ? await duotoneDataUrl(picked.signedUrl)
      : picked.signedUrl
    : null;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/app/api/og/recap-card/route.spec.ts`
Expected: PASS (기존 5 + 신규 2 = 7).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/og/recap-card/route.tsx src/app/api/og/recap-card/route.spec.ts
git commit -m "feat(og): recap-card 히어로를 seed 기반 내 사진 랜덤으로(전체 폴백)"
```

---

## Task 4: recap-clip 라우트 — 몽타주 사진카드 통일 + seed 샘플 + 엔드카드 내 사진 (D + E)

**Files:**
- Modify: `src/app/api/share/recap-clip/route.ts`
- Modify: `src/app/api/share/recap-clip/storyboard.ts`
- Modify: `src/app/api/share/recap-clip/frames.tsx`
- Test: `src/app/api/share/recap-clip/route.spec.ts`

- [ ] **Step 1: 테스트 추가 (사진 있을 때 200)**

`route.spec.ts` 의 `const { fetchRecap } = ...`(line 21) 다음에 추가:

```ts
const { fetchChallengePhotos } = await import("@/lib/db/reads/challenge-photos");
```

`describe` 끝에 추가:

```ts
  it("사진 있으면 몽타주 샘플로 200 video/mp4 (렌더 throw 없음)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "p1", signedUrl: "s1", takenAt: "t", ownerDisplayName: "나", ownerId: "u1" },
      { id: "p2", signedUrl: "s2", takenAt: "t", ownerDisplayName: "남", ownerId: "u2" },
    ]);
    const res = await GET(req("challengeId=c1&seed=5"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/share/recap-clip/route.spec.ts`
Expected: 현재도 PASS 가능(회귀 가드). 이어 D/E 구현으로 진행.

- [ ] **Step 3a: storyboard 에서 MAX_MONTAGE export**

`storyboard.ts` 의 `const MAX_MONTAGE = 6;` 를 `export const MAX_MONTAGE = 6;` 로 바꾼다.

- [ ] **Step 3b: route.ts — seed 샘플 + 엔드카드 내 사진 + 몽타주 사진카드**

`route.ts` import 블록을 아래로 교체(`renderMontageFrame` 제거, `pickOne`/`sample`·`MAX_MONTAGE` 추가):

```ts
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { renderPhotoCard, type CardData } from "@/app/api/og/recap-card/templates";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { fetchRecap } from "@/lib/db/reads/recap";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { formatSharePeriod } from "@/lib/share/period";
import { pickOne, sample } from "@/lib/share/seeded-pick";
import { createClient } from "@/lib/supabase/server";
import { encodeClip } from "./encode";
import { renderIntroFrame } from "./frames";
import { buildStoryboard, MAX_MONTAGE, type Beat } from "./storyboard";
```

`GET` 안 photos/heroUrl/data/storyboard/pngs 계산부를 교체한다. 기존:

```ts
    const photos = await fetchChallengePhotos(challengeId, { client: supabase });
    const heroUrl = photos.length > 0 ? photos[photos.length - 1].signedUrl : null;
    const data: CardData = {
      groupName: recap.group?.name ?? "우리 그룹",
      period: formatSharePeriod(recap.startAt, recap.endAt),
      doneCount: recap.viewerDoneCount,
      crew: recap.members.length,
      heroUrl,
      allAchieved: recap.members.length > 0 && recap.members.every((member) => member.achieved),
    };

    const storyboard = buildStoryboard({ photoCount: photos.length, fps: FPS });
    const fonts = await loadCardFonts();
    const pngs = await Promise.all(
      storyboard.beats.map((beat) => renderBeatPng(beat, data, photos, fonts)),
    );
```

교체 후:

```ts
    const seed = Number(url.searchParams.get("seed")) || 0;
    const photos = await fetchChallengePhotos(challengeId, { client: supabase });

    // 엔드카드 = 미리본 사진 카드와 동일: 내 사진 중 seed 픽(없으면 전체).
    const mine = photos.filter((p) => p.ownerId === user.id);
    const endcardPhoto = pickOne(mine.length > 0 ? mine : photos, seed);
    const data: CardData = {
      groupName: recap.group?.name ?? "우리 그룹",
      period: formatSharePeriod(recap.startAt, recap.endAt),
      doneCount: recap.viewerDoneCount,
      crew: recap.members.length,
      heroUrl: endcardPhoto?.signedUrl ?? null,
      allAchieved: recap.members.length > 0 && recap.members.every((member) => member.achieved),
    };

    // 몽타주 = 전체 사진의 seed 샘플(최대 MAX_MONTAGE).
    const montage = sample(photos, MAX_MONTAGE, seed);

    const storyboard = buildStoryboard({ photoCount: montage.length, fps: FPS });
    const fonts = await loadCardFonts();
    const pngs = await Promise.all(
      storyboard.beats.map((beat) => renderBeatPng(beat, data, montage, fonts)),
    );
```

`renderBeatPng` 시그니처와 photo beat 분기를 교체한다. 기존:

```ts
async function renderBeatPng(
  beat: Beat,
  data: CardData,
  photos: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const element =
    beat.kind === "endcard"
      ? renderPhotoCard(data)
      : beat.kind === "intro"
        ? renderIntroFrame(data.groupName)
        : renderMontageFrame(photos[beat.photoIndex ?? 0]?.signedUrl ?? null);
```

교체 후:

```ts
async function renderBeatPng(
  beat: Beat,
  data: CardData,
  montage: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const element =
    beat.kind === "endcard"
      ? renderPhotoCard(data)
      : beat.kind === "intro"
        ? renderIntroFrame(data.groupName)
        : // D-D: 몽타주도 사진 카드 레이아웃. 카드 프레임 고정 + 히어로 사진만 순환.
          renderPhotoCard({ ...data, heroUrl: montage[beat.photoIndex ?? 0]?.signedUrl ?? null });
```

- [ ] **Step 3c: frames.tsx — renderMontageFrame 제거**

`frames.tsx` 에서 `renderMontageFrame` 함수 전체(현재 line 42-84)를 삭제한다. 상단 import 에서 더 이상 쓰지 않는 `TERRA` 를 제거한다(`renderIntroFrame` 은 `CREAM·INK·SUBTEXT` 만 사용):

```ts
import { CREAM, INK, SUBTEXT } from "@/app/api/og/recap-card/templates";
```

(파일에는 `renderIntroFrame` 만 남는다.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/app/api/share/recap-clip/`
Expected: PASS(route 5 + storyboard 기존).

Run: `pnpm typecheck`
Expected: 통과(`renderMontageFrame`/`photos` 잔여 참조 없음).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/share/recap-clip/route.ts src/app/api/share/recap-clip/storyboard.ts src/app/api/share/recap-clip/frames.tsx src/app/api/share/recap-clip/route.spec.ts
git commit -m "feat(clip): 몽타주를 사진 카드 레이아웃으로 통일 + seed 랜덤(전체)·엔드카드 내 사진"
```

---

## Task 5: 계좌 복사 공용 훅 추출 + AccountInfoSheet 리팩터 (A)

**Files:**
- Create: `src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts`
- Modify: `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx`
- Test(기존 유지): `src/app/(app)/challenge/[id]/_components/account-info-sheet.spec.tsx`

- [ ] **Step 1: 공용 훅 작성**

```ts
// src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import type { ErrorCode } from "@/lib/actions/response";
import { revealAccountNumber } from "../_actions";

const userMessage = makeUserMessage({
  not_found: "오너가 아직 계좌를 등록하지 않았어요.",
});

// D-016: 계좌번호 복사 공용 훅. revealAccountNumber 로 암호문을 복호화해 평문을 받아
// 즉시 clipboard 에 복사. iOS Safari/PWA transient activation 보존을 위해 write() 를
// 제스처 핸들러 안에서 동기 호출하고 ClipboardItem 에 Promise<Blob> 를 넘긴다.
export function useCopyAccountNumber(groupId: string): { copy: () => void; copying: boolean } {
  const [copying, setCopying] = useState(false);

  function copy() {
    setCopying(true);

    // reveal 결과를 promise 바깥에 기록 — 3갈래(액션 실패 / 액션 throw / clipboard 실패)
    // 토스트를 정확히 구분하기 위함.
    let revealError: ErrorCode | null = null;
    let revealThrew = false;

    const text = revealAccountNumber({ groupId }).then(
      (res) => {
        if (!res.ok) {
          revealError = res.error;
          throw new Error("reveal-failed");
        }
        return res.data.accountNumber;
      },
      (err) => {
        revealThrew = true;
        console.error("[useCopyAccountNumber] revealAccountNumber threw", err);
        throw err;
      },
    );

    const finish = (write: Promise<unknown>) =>
      write
        .then(() => toast.success("계좌번호가 복사되었어요"))
        .catch((err) => {
          if (revealError) {
            toast.error(userMessage(revealError));
          } else if (revealThrew) {
            toast.error(FALLBACK_ERROR_MESSAGE);
          } else {
            console.error("[useCopyAccountNumber] clipboard write failed", err);
            toast.error("복사에 실패했어요. 다시 시도해 주세요.");
          }
        })
        .finally(() => setCopying(false));

    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
      try {
        const blob = text.then((n) => new Blob([n], { type: "text/plain" }));
        blob.catch(() => {}); // 구형 Chrome 생성자 throw 시 orphan unhandled rejection 방지
        finish(navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]));
        return;
      } catch {
        // 구형 Chrome(76–115): ClipboardItem 은 있으나 Promise 값을 거부 → 구 경로로.
      }
    }

    // 구 경로 (Firefox<127 · 비-secure context · 데스크톱 비엄격): reveal 후 writeText.
    finish(text.then((n) => navigator.clipboard.writeText(n)));
  }

  return { copy, copying };
}
```

- [ ] **Step 2: AccountInfoSheet 가 훅을 쓰도록 교체**

`account-info-sheet.tsx`:

(1) import 정리 — **제거**: `useState`(react), `toast`(sonner), `FALLBACK_ERROR_MESSAGE, makeUserMessage`, `import type { ErrorCode }`, `import { revealAccountNumber } from "../_actions"`. **추가**:

```ts
import { useCopyAccountNumber } from "./use-copy-account-number";
```

(`Copy` · `Dialog*` · `Button` · `BANK_NAMES`/`BankCode` · `maskAccountNumber` import 는 유지.)

(2) 본문에서 파일 상단 `const userMessage = ...` 와 컴포넌트 안 `const [copying, setCopying] = useState(false);` 및 `function copy() { ... }` 전체를 **삭제**하고, `hasAccount` 계산 부근에 한 줄을 둔다:

```ts
  const { copy, copying } = useCopyAccountNumber(groupId);
```

(JSX 의 `onClick={copy}` · `disabled={!hasAccount || copying}` · `{copying ? "복사 중..." : "계좌번호 복사"}` 는 그대로.)

- [ ] **Step 3: 기존 테스트로 동작 불변 확인**

Run: `pnpm test src/app/\(app\)/challenge/\[id\]/_components/account-info-sheet.spec.tsx`
Expected: PASS(기존 8 tests — UI 경로 동일). 실패 시 import/삭제 누락 점검.

- [ ] **Step 4: 타입 확인**

Run: `pnpm typecheck`
Expected: 통과(잔여 미사용 import 없음).

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts" "src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx"
git commit -m "refactor(account): 계좌 복사 로직을 useCopyAccountNumber 훅으로 추출(동작 불변)"
```

---

## Task 6: 영수증 ACCOUNT 계좌 복사 버튼 (A)

**Files:**
- Create: `src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`

- [ ] **Step 1: 버튼 테스트 작성**

```tsx
// @vitest-environment jsdom
// src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { copyFn, state } = vi.hoisted(() => ({
  copyFn: vi.fn(),
  state: { copying: false },
}));
vi.mock("../../_components/use-copy-account-number", () => ({
  useCopyAccountNumber: () => ({ copy: copyFn, copying: state.copying }),
}));

import { AccountCopyButton } from "./account-copy-button";

describe("AccountCopyButton", () => {
  beforeEach(() => {
    copyFn.mockReset();
    state.copying = false;
  });

  it("클릭 시 copy() 호출", () => {
    render(<AccountCopyButton groupId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));
    expect(copyFn).toHaveBeenCalledTimes(1);
  });

  it("copying 중에는 '복사 중...' 표시 + disabled", () => {
    state.copying = true;
    render(<AccountCopyButton groupId="g1" />);
    const btn = screen.getByRole("button", { name: /복사 중/ });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx"`
Expected: FAIL — `Cannot find module "./account-copy-button"`.

- [ ] **Step 3: 버튼 구현**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx
"use client";

import { Copy } from "lucide-react";
import { useCopyAccountNumber } from "../../_components/use-copy-account-number";

// 정산 영수증 ACCOUNT 줄 인라인 텍스트 버튼 — 탭 1회로 전체 계좌번호 복사.
export function AccountCopyButton({ groupId }: { groupId: string }) {
  const { copy, copying } = useCopyAccountNumber(groupId);
  return (
    <button
      type="button"
      onClick={copy}
      disabled={copying}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--invite-accent,#B07A4D)] underline-offset-2 hover:underline disabled:opacity-60"
    >
      <Copy className="size-3" aria-hidden="true" />
      {copying ? "복사 중..." : "계좌번호 복사"}
    </button>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: SettlementReceipt 에 groupId prop + 버튼 배치**

`settlement-receipt.tsx`:

(1) 상단 import 추가:

```ts
import { AccountCopyButton } from "./account-copy-button";
```

(2) `Props` 타입에 `accountNumberLast4: string | null;` 다음 줄 추가:

```ts
  groupId: string | null;
```

(3) 함수 파라미터 구조분해에서 `accountNumberLast4,` 다음에 추가:

```ts
  groupId,
```

(4) ACCOUNT 블록의 마스킹 `<p>` 다음에 버튼 추가:

```tsx
          {account && (
            <>
              <p className={cn(LABEL, "mt-3")}>ACCOUNT</p>
              <p className="mt-1 text-[13px]">
                {bankLabel(account.code)} ***-****{account.last4} ·{" "}
                <span className="font-semibold">{account.holder}</span>
              </p>
              {groupId && <AccountCopyButton groupId={groupId} />}
            </>
          )}
```

- [ ] **Step 6: page.tsx 가 groupId 전달**

`recap/page.tsx` 의 `<SettlementReceipt ... />` 호출에서 `accountNumberLast4={...}` 다음에 추가:

```tsx
        groupId={recap.group?.id ?? null}
```

- [ ] **Step 7: 타입·테스트 확인**

Run: `pnpm typecheck`
Expected: 통과(호출처가 새 필수 prop `groupId` 전달).

Run: `pnpm test "src/app/(app)/challenge/[id]/recap/"`
Expected: PASS. settlement-receipt.spec 가 `groupId` 누락으로 타입/렌더 실패하면 그 spec 의 render 에 `groupId={null}` 를 추가한다.

- [ ] **Step 8: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx" "src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx" "src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx" "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "feat(recap): 정산 영수증 ACCOUNT 에 계좌번호 1탭 복사 버튼"
```

---

## Task 7: share-card-action — 순서·기본값(C) + 데드락 수정(B) + seed 전파(E)

**Files:**
- Modify: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`
- Test: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`

- [ ] **Step 1: 스펙 파일 교체 (RED)**

`share-card-action.spec.tsx` 전체를 아래로 교체한다.

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareCardAction } from "./share-card-action";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    Object.defineProperty(global.navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: undefined, configurable: true });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:fake"),
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("형식 3개 radio + 기본 선택 티켓", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    const group = screen.getByRole("radiogroup", { name: "공유 형식" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "티켓" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "사진" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "영상" })).toHaveAttribute("aria-checked", "false");
  });

  it("공유 버튼은 단일 + 접근명 '공유하기'", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
  });

  it("영상 선택 후 공유 시 recap-clip URL(seed) fetch + navigator.share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/share/recap-clip?challengeId=c1&seed=1"),
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("사진 선택 후 공유 시 template=photo&seed URL fetch (다운로드 폴백)", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=photo&seed=1",
      ),
    );
  });

  it("티켓(기본) 공유 시 template=ticket&seed URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=ticket&seed=1",
      ),
    );
  });

  it("Web Share files 미지원 시 a[download] 폴백 + URL.revokeObjectURL 호출", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake"));
  });

  it("share 취소(AbortError) 시 toast.error 호출 안 함", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it("미리보기: 기본은 티켓(template=ticket&seed) 이미지 + lazy", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("challengeId=c1");
    expect(img.getAttribute("src")).toContain("template=ticket");
    expect(img.getAttribute("src")).toContain("seed=1");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("미리보기: 로딩 중 선택 이미지가 hidden(display:none) 아님 — lazy+hidden 데드락 방지", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.className).not.toContain("hidden");
  });

  it("미리보기: 로드 전 스켈레톤 노출", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    expect(screen.getByTestId("share-preview-skeleton")).toBeTruthy();
  });

  it("미리보기: 영상 선택 시 로드 후 MP4 배지", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "영상" }));
    fireEvent.load(screen.getByAltText("사진형 공유 카드 미리보기"));
    expect(screen.getByText("MP4")).toBeTruthy();
  });

  it("미리보기: 티켓 기본은 template=ticket 이미지 · MP4 배지 없음", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("template=ticket");
    expect(screen.queryByText("MP4")).toBeNull();
  });

  it("미리보기: 로드 실패 시 fallback 문구 표시", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.error(screen.getByAltText("티켓형 공유 카드 미리보기"));
    expect(screen.getByText("미리보기를 불러오지 못했어요")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"`
Expected: FAIL — 컴포넌트가 `seed` prop 없음·기본 영상·`hidden` 사용·URL 에 seed 없음.

- [ ] **Step 3: 컴포넌트 전체 교체**

`share-card-action.tsx` 전체를 아래로 교체한다.

```tsx
// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { useState } from "react";
import { Check, Clapperboard, Image as ImageIcon, Play, Share2, Ticket } from "lucide-react";
import { toast } from "sonner";

type Template = "clip" | "photo" | "ticket";
type PreviewKind = "photo" | "ticket";
type Props = { challengeId: string; shareMessage: string; seed: number };

const FORMATS: ReadonlyArray<{ value: Template; label: string; Icon: typeof Clapperboard }> = [
  { value: "ticket", label: "티켓", Icon: Ticket },
  { value: "photo", label: "사진", Icon: ImageIcon },
  { value: "clip", label: "영상", Icon: Clapperboard },
];

const PREVIEW_KIND: Record<Template, PreviewKind> = {
  clip: "photo",
  photo: "photo",
  ticket: "ticket",
};

const PREVIEW_ALT: Record<PreviewKind, string> = {
  photo: "사진형 공유 카드 미리보기",
  ticket: "티켓형 공유 카드 미리보기",
};

function ogCardSrc(challengeId: string, kind: PreviewKind, seed: number): string {
  return `/api/og/recap-card?${new URLSearchParams({
    challengeId,
    template: kind,
    seed: String(seed),
  }).toString()}`;
}

async function shareCard(
  challengeId: string,
  template: Template,
  text: string,
  seed: number,
): Promise<void> {
  const isClip = template === "clip";
  const endpoint = isClip
    ? `/api/share/recap-clip?challengeId=${encodeURIComponent(challengeId)}&seed=${seed}`
    : `/api/og/recap-card?${new URLSearchParams({
        challengeId,
        template,
        seed: String(seed),
      }).toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `recap-${challengeId}-${template}.${isClip ? "mp4" : "png"}`, {
    type: isClip ? "video/mp4" : "image/png",
  });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({ files: [file], text });
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
}

function SharePreview({
  challengeId,
  seed,
  seen,
  template,
}: {
  challengeId: string;
  seed: number;
  seen: ReadonlySet<PreviewKind>;
  template: Template;
}) {
  const kind = PREVIEW_KIND[template];
  const [status, setStatus] = useState<Record<PreviewKind, "loading" | "loaded" | "error">>({
    photo: "loading",
    ticket: "loading",
  });

  return (
    <div
      className="bg-muted relative mx-auto w-[160px] overflow-hidden rounded-xl"
      style={{ aspectRatio: "4 / 5" }}
    >
      {status[kind] === "loading" && (
        // 크림 톤 shimmer — 배경 없는 pulse 가 '공백'으로 읽히던 문제 보완(D-B).
        <div
          data-testid="share-preview-skeleton"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#FAF6EF] to-[#EFE7D8]"
        />
      )}
      {status[kind] === "error" && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-3 text-center text-[11px]">
          미리보기를 불러오지 못했어요
        </div>
      )}
      {(["photo", "ticket"] as const).map((previewKind) =>
        seen.has(previewKind) ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin OG 라우트 미리보기는 인증 쿠키 전달이 필요하다.
          <img
            key={previewKind}
            src={ogCardSrc(challengeId, previewKind, seed)}
            alt={PREVIEW_ALT[previewKind]}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus((prev) => ({ ...prev, [previewKind]: "loaded" }))}
            onError={() => setStatus((prev) => ({ ...prev, [previewKind]: "error" }))}
            // D-B: display:none(hidden) 대신 opacity 로 숨긴다 — hidden+lazy 는 영영 로드 안 됨.
            className={`absolute inset-0 size-full object-cover transition-opacity ${
              previewKind === kind && status[previewKind] === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null,
      )}
      {template === "clip" && status[kind] === "loaded" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            MP4
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/90 shadow">
            <Play
              className="text-foreground size-4 translate-x-px"
              fill="currentColor"
              aria-hidden="true"
            />
          </span>
        </div>
      )}
    </div>
  );
}

export function ShareCardAction({ challengeId, shareMessage, seed }: Props) {
  const [template, setTemplate] = useState<Template>("ticket");
  const [seenPreviewKinds, setSeenPreviewKinds] = useState<ReadonlySet<PreviewKind>>(
    () => new Set([PREVIEW_KIND.ticket]),
  );
  const [pending, setPending] = useState(false);

  async function onShare(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await shareCard(challengeId, template, shareMessage, seed);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(
        template === "clip"
          ? "공유 영상 생성에 실패했어요. 다시 시도해 주세요."
          : "공유 카드 생성에 실패했어요. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  function selectTemplate(value: Template): void {
    setTemplate(value);
    const previewKind = PREVIEW_KIND[value];
    setSeenPreviewKinds((prev) => (prev.has(previewKind) ? prev : new Set(prev).add(previewKind)));
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <SharePreview
        challengeId={challengeId}
        seed={seed}
        seen={seenPreviewKinds}
        template={template}
      />

      <div role="radiogroup" aria-label="공유 형식" className="mt-1 grid grid-cols-3 gap-2">
        {FORMATS.map(({ value, label, Icon }) => {
          const checked = template === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => selectTemplate(value)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-semibold transition-colors ${
                checked
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted"
              }`}
            >
              {checked && (
                <span className="bg-foreground absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full">
                  <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              <Icon className="size-[22px]" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void onShare()}
        disabled={pending}
        className="bg-primary text-primary-foreground flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-60"
      >
        <Share2 className="size-4" aria-hidden="true" />
        {pending ? (template === "clip" ? "영상 만드는 중..." : "카드 만드는 중...") : "공유하기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: page.tsx 가 seed 전달**

`recap/page.tsx`:

(1) `const shareMessage = ...` 다음 줄에 추가:

```ts
  // D-E: 요청당 1회 seed — 미리보기·공유 URL 에 함께 실어 "미리보기=공유물" 보장.
  // 동적 페이지(requireUser/headers)라 방문마다 재추첨된다.
  const shareSeed = Math.floor(Math.random() * 2_147_483_647);
```

(2) `<ShareCardAction ... />` 에 prop 추가:

```tsx
      <ShareCardAction challengeId={challengeId} shareMessage={shareMessage} seed={shareSeed} />
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"`
Expected: PASS (13 tests).

Run: `pnpm typecheck`
Expected: 통과(호출처가 새 필수 prop `seed` 전달).

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx" "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx" "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "feat(recap): 형식 순서·기본 티켓 + 미리보기 lazy/display:none 데드락 수정 + seed 전파"
```

---

## Task 8: 전체 검증 + 수동 확인

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 자동 검증**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm lint`
Expected: 0 errors(raw `<img>` 는 기존 eslint-disable 주석 유지).

Run: `pnpm test`
Expected: 전체 PASS.

- [ ] **Step 2: 프로덕션 빌드(라우트·client boundary 회귀)**

Run: `pnpm build`
Expected: 성공. `frames.tsx`/`recap-clip` 라우트·`share-card-action` client boundary 경고 없음.

- [ ] **Step 3: 수동 확인 (실브라우저 / 모바일 viewport — B는 실브라우저 필수)**

`pnpm dev` → `http://localhost:3000`, 종료된 챌린지의 `/challenge/[id]/recap` 진입(테스트 계정 로그인).

- [ ] **A. 계좌 복사**: 계좌 등록된 정산에서 ACCOUNT "계좌번호 복사" 탭 → 토스트 + 클립보드 전체 번호. iOS Safari/PWA 에서도 1탭 동작.
- [ ] **B. 미리보기**: 진입 시 미리보기가 **실제 로드**되어 카드가 보임(공백 아님). 느린 네트워크에서 크림 shimmer → 카드. DevTools 로 선택 `<img>` 가 `display:none` 아님 확인.
- [ ] **C. 순서·기본값**: 카드 순서 `[티켓·사진·영상]`, 첫 진입 선택 = 티켓.
- [ ] **D. 영상**: 영상 공유/다운로드 → 인트로 후 **사진 카드 레이아웃에서 사진만 순환**, 엔드카드 = 미리본 카드와 같은 사진(중앙 크롭).
- [ ] **E. 랜덤·일치**: 새로고침마다 사진 바뀜. **같은 방문 안 미리보기 = 공유/저장 파일 사진** 동일. 사진/티켓=내 사진(없으면 전체), 영상=전체. 모두 0장이면 단색.

- [ ] **Step 4: 검증 결과 기록 후 PR 준비**

base `develop`. PR 본문 한국어, 스펙 링크 + 가드레일 체크 + 수동 검증 결과. (자동 push·PR 생성은 사용자 확인 후.)

---

## Self-Review (작성자 점검)

**1. Spec coverage**
- A 계좌 복사 → Task 5(훅)·6(버튼/배치). ✓
- B 데드락 → Task 7 Step3(opacity) + 회귀 테스트. ✓
- C 순서·기본값 → Task 7(FORMATS·default·seen). ✓
- D 영상 통일 → Task 4(renderPhotoCard montage + frames 정리). ✓
- E 랜덤·seed → Task 1(헬퍼)·2(ownerId)·3(OG)·4(clip)·7(seed prop+page). ✓
- 폴백(내 사진 0→전체→단색) → Task 3·4 의 `mine.length>0?mine:photos` + `pickOne` null. ✓

**2. Placeholder scan**: TBD/TODO/"적절히 처리" 없음. 모든 코드 step 에 실제 코드 포함. ✓

**3. Type consistency**:
- `pickOne(arr, seed): T | null` · `sample(arr, n, seed): T[]` — Task 1 정의, Task 3·4 사용 일치. ✓
- `RecapPhotoView.ownerId: string` — Task 2 정의, Task 3·4 의 `p.ownerId` 사용 일치. ✓
- `useCopyAccountNumber(groupId): { copy, copying }` — Task 5 정의, Task 6 사용 일치. ✓
- `ShareCardAction` props `{ challengeId, shareMessage, seed }` — Task 7 정의, page 전달 일치. ✓
- `SettlementReceipt` `groupId: string | null` — Task 6 정의, page 전달 일치. ✓
- `MAX_MONTAGE` export(Task 4 Step3a) ↔ import(Step3b) 일치. ✓
- `renderBeatPng(beat, data, montage, fonts)` 시그니처 ↔ 호출 일치. ✓

이슈 없음.
