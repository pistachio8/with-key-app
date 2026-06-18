# 개발자에게 건의하기 — 멀티 사진(최대 3) + 작성 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마이페이지 '개발자에게 건의하기'에서 사진을 최대 3장 첨부할 수 있게 하고, 작성 화면을 개선안 디자인으로 교체한다. 첨부된 사진 전부가 실수신처인 Slack #qa 에 노출되게 한다.

**Architecture:** ADR-0035 의 **읽기 자세(feedback INSERT-only, 본인 SELECT 없음)는 그대로 유지**한다. `feedback` 에 `photo_paths text[]`(최대 3)만 비파괴 추가하고, storage 헬퍼·`submitFeedback`·Slack notify 를 멀티 사진으로 확장한다. ADR-0035 가 명시한 "사진 1장" 동작이 바뀌므로 ADR 에 amendment 노트를 남긴다. 새 RLS·status·열람 화면은 도입하지 않는다.

**스코프(중요):** 그릴링 결과 **트랙 A(멀티 사진 + 작성 개선)만** 구현한다. '내 건의 내역 / 처리 상태 / 개발팀 답변'(트랙 B)은 **범위 밖**이며, 별도 계획으로 ⑴ ADR-0035 의 INSERT-only 결정 개정 + ⑵ 상태를 실제로 갱신할 트리아지 담당/주기가 확정될 때만 착수한다. 그 전까지 사진의 유일한 실시간 소비자는 Slack #qa 이므로(설계 근거 ADR-0035), 멀티 사진 가치는 "Slack 에 N장 전부 노출"에 달려 있다 — Task 4 가 그것이다.

**구현 타깃 디자인(Open Design 프로젝트 산출물, 시각/인터랙션/카피 SoT):**

- `feedback-page-redesign.html` — A-only 정리본(앱바 우측 비움, 완료 CTA "마이페이지로 돌아가기", 사진 **최대 3장** 타일 그리드/개별 삭제/용량 태그, 분류 세그먼트 칩, 카테고리별 동적 가이드/플레이스홀더, 실시간 글자수 경고색, stamp 완료 연출). 이 파일에는 더 이상 내역 화면 링크가 없다.

이 HTML 은 with-key 토큰(`--primary #8AA4FF`, `radius 14px`, `t-*`, Pretendard)을 미러링한다. 포팅 시 색/타이포/레이아웃/상태/카피를 그대로 가져오되, 구현은 `@/components/ui/*`(base-ui) + Tailwind 토큰으로 한다.

**Tech Stack:** Next.js App Router(Server Actions), Supabase(Postgres + Storage), `@withkey/domain`(zod SoT), vitest, pnpm 워크스페이스.

---

## File Structure

**생성**

- `supabase/migrations/0049_feedback_multi_photo.sql` — `photo_paths text[]`(≤3) 추가 + 백필.

**수정**

- `docs/adr/0035-feedback-table-storage.md` — amendment 노트(사진 1→3, Slack 멀티 노출).
- `packages/domain/src/validators/feedback.ts` — `MAX_FEEDBACK_PHOTOS = 3`.
- `packages/domain/src/validators/feedback.spec.ts` — 한도 테스트.
- `apps/web/src/lib/storage/feedback-photos.ts` — `uploadFeedbackPhotos`(복수) 헬퍼.
- `apps/web/src/lib/storage/feedback-photos.spec.ts` — 멀티 업로드 테스트.
- `apps/web/src/lib/slack/notify.ts` — `photoUrl` → `photoUrls: string[]`, payload N장 노출.
- `apps/web/src/lib/slack/notify.spec.ts` — payload 멀티 테스트(없으면 생성).
- `apps/web/src/lib/analytics/schema.ts` — `feedback_submitted` 이벤트.
- `apps/web/src/lib/analytics/schema-union-parity.spec.ts` — fixture parity.
- `apps/web/src/app/(app)/me/feedback/_actions.ts` — 멀티 사진 수신/업로드 + Slack 멀티 + analytics.
- `apps/web/src/app/(app)/me/feedback/_actions.spec.ts` — 멀티 사진 단언.
- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx` — 단일→멀티(≤3) 타일 그리드.
- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx` — 멀티 사진 폼 테스트(없으면 생성).

**건드리지 않음:** feedback RLS(INSERT-only 유지), `/me/feedback/page.tsx` 헤더/카피(작성 화면 본문만), 마이페이지 허브(B 진입 미추가).

---

## Task 1: 도메인 — 사진 최대 장수 (zod SoT)

**Files:**

- Modify: `packages/domain/src/validators/feedback.ts`
- Test: `packages/domain/src/validators/feedback.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`feedback.spec.ts` import 에 `MAX_FEEDBACK_PHOTOS` 를 추가하고:

```ts
import { MAX_FEEDBACK_PHOTOS } from "./feedback";

describe("MAX_FEEDBACK_PHOTOS", () => {
  it("사진 최대 장수는 3", () => {
    expect(MAX_FEEDBACK_PHOTOS).toBe(3);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run packages/domain/src/validators/feedback.spec.ts`
Expected: FAIL — `MAX_FEEDBACK_PHOTOS` 미정의.

- [ ] **Step 3: 도메인 구현**

`packages/domain/src/validators/feedback.ts` 끝에 추가(기존 export 유지):

```ts
// 사진 첨부 최대 장수 — feedback.photo_paths check(array_length <= 3) 및 Slack 멀티 노출과 동기.
// ADR-0035 amendment(2026-06-18): 최초 1장 → 3장.
export const MAX_FEEDBACK_PHOTOS = 3;
```

validators 배럴이 `export * from "./feedback"` 면 추가 작업 불필요. 명시 목록이면 새 심볼 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run packages/domain/src/validators/feedback.spec.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/domain/src/validators/feedback.ts packages/domain/src/validators/feedback.spec.ts
git commit -m "feat(domain): 건의 사진 최대 3장 상수"
```

---

## Task 2: 마이그레이션 0049 + ADR amendment

**Files:**

- Create: `supabase/migrations/0049_feedback_multi_photo.sql`
- Modify: `docs/adr/0035-feedback-table-storage.md`

> append-only / 비파괴. RLS·status·열람 정책은 손대지 않는다(ADR-0035 읽기 자세 유지). 멀티 사진은 기존 경로 규격 `{userId}/{feedbackId}-{nonce}.{ext}` + 기존 owner-scoped storage RLS 로 이미 지원되므로 storage 정책 변경 불필요.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0049_feedback_multi_photo.sql`:

```sql
-- 0049_feedback_multi_photo.sql — 건의 사진 멀티(최대 3). ADR-0035 amendment(사진 1→3, Slack 멀티 노출).
-- plan: docs/superpowers/plans/2026-06-18-feedback-multi-photo.md
-- 0047_feedback.sql(INSERT-only) 비파괴 확장 — RLS/status/열람 정책은 변경 없음.

alter table public.feedback
  add column if not exists photo_paths text[] not null default '{}'
    check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 3);

-- 기존 단일 photo_path 백필. photo_path 는 삭제하지 않고 deprecated 보존(슬랙 단일 미리보기 하위호환).
update public.feedback
  set photo_paths = array[photo_path]
  where photo_path is not null and photo_paths = '{}';

comment on column public.feedback.photo_paths is
  'feedback-photos object paths "{userId}/{feedbackId}-{nonce}.{ext}" (최대 3). photo_path(단일)는 0049 이후 deprecated.';
```

- [ ] **Step 2: 로컬 적용 + 확인**

Run: `pnpm supabase db reset` (또는 저장소 마이그레이션 적용 워크플로)
이어서 Studio/psql:

```sql
select column_name, data_type from information_schema.columns
  where table_name = 'feedback' and column_name = 'photo_paths';   -- 1행 (ARRAY)
-- RLS 가 그대로(추가 SELECT 정책 없음)인지 확인:
select polname from pg_policies where tablename = 'feedback';      -- feedback_insert_self 만
```

Expected: `photo_paths` 추가, feedback 정책은 INSERT 만(변경 없음).

- [ ] **Step 3: ADR-0035 amendment 노트**

`docs/adr/0035-feedback-table-storage.md` 끝에 추가:

```markdown
## Amendment — 2026-06-18 (migration 0049)

**변경:** 사진 첨부 1장 → **최대 3장**. 첨부된 사진 **전부**를 Slack #qa 에 노출(기존 1장 → N장).

**근거:** 버그 리포트에서 여러 화면/단계 캡처를 한 번에 받으면 트리아지 정보량이 커진다. 열람 화면(트랙 B)은 여전히 만들지 않으므로 사진의 실시간 소비자는 #qa 뿐 — 따라서 멀티 사진은 Slack 멀티 노출과 한 쌍으로만 의미가 있다.

**유지되는 결정:** feedback INSERT-only RLS, 본인 SELECT 미개방, owner-scoped `feedback-photos` 버킷, id 선생성 + 업로드 선행. 본 amendment 는 결정 1번(열람 화면 없음)을 **반전하지 않는다**.

**구현:** `feedback.photo_paths text[]`(≤3, 0049), `uploadFeedbackPhotos`, `buildFeedbackPayload` 의 `photoUrls: string[]`.
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0049_feedback_multi_photo.sql docs/adr/0035-feedback-table-storage.md
git commit -m "feat(db): 건의 photo_paths[] (최대 3) + ADR-0035 amendment (0049)"
```

---

## Task 3: Storage — 멀티 사진 업로드 헬퍼

**Files:**

- Modify: `apps/web/src/lib/storage/feedback-photos.ts`
- Test: `apps/web/src/lib/storage/feedback-photos.spec.ts`

> 경로 규격이 같은 feedbackId 로 nonce 만 달리해 여러 장을 이미 허용한다. 단건 `uploadFeedbackPhoto` 를 반복하는 얇은 래퍼만 추가(비파괴, best-effort).

- [ ] **Step 1: 실패 테스트 추가**

`feedback-photos.spec.ts` 에 추가(기존 mock 패턴 재사용):

```ts
import { uploadFeedbackPhotos } from "./feedback-photos";

it("uploadFeedbackPhotos: 같은 feedbackId 로 N장 업로드하고 성공 path 만 반환", async () => {
  const client = {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  const mk = (n: string) => new File([new Uint8Array([1, 2, 3])], n, { type: "image/png" });

  const paths = await uploadFeedbackPhotos({
    userId: "11111111-1111-1111-1111-111111111111",
    feedbackId: "22222222-2222-2222-2222-222222222222",
    files: [mk("a.png"), mk("b.png")],
    client,
  });

  expect(paths).toHaveLength(2);
  expect(
    paths.every((p) =>
      p.startsWith("11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222-"),
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run apps/web/src/lib/storage/feedback-photos.spec.ts`
Expected: FAIL — `uploadFeedbackPhotos` 미정의.

- [ ] **Step 3: 헬퍼 구현**

`feedback-photos.ts` 의 `uploadFeedbackPhoto` 정의 바로 아래에 추가:

```ts
// 멀티 사진 — 같은 feedbackId 로 N장 업로드. 실패한 장은 건너뛰고 성공 path 만 순서대로 반환(비파괴).
export async function uploadFeedbackPhotos(args: {
  userId: string;
  feedbackId: string;
  files: File[];
  client?: SupabaseClient;
}): Promise<string[]> {
  const supabase = args.client ?? (await createClient());
  const paths: string[] = [];
  for (const file of args.files) {
    const res = await uploadFeedbackPhoto({
      userId: args.userId,
      feedbackId: args.feedbackId,
      file,
      client: supabase,
    });
    if (res.ok) paths.push(res.path);
    else
      console.warn("[uploadFeedbackPhotos] skip", {
        feedbackId: args.feedbackId,
        reason: res.reason,
      });
  }
  return paths;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run apps/web/src/lib/storage/feedback-photos.spec.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/storage/feedback-photos.ts apps/web/src/lib/storage/feedback-photos.spec.ts
git commit -m "feat(storage): 건의 멀티 사진 업로드 헬퍼"
```

---

## Task 4: Slack notify — 사진 N장 전부 노출

**Files:**

- Modify: `apps/web/src/lib/slack/notify.ts`
- Test: `apps/web/src/lib/slack/notify.spec.ts` (없으면 생성)

> 멀티 사진의 실수신처. 단일 `photoUrl` → 복수 `photoUrls` 로 바꾸고 payload 에 N줄 노출.

- [ ] **Step 1: 실패 테스트 추가**

`apps/web/src/lib/slack/notify.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFeedbackPayload } from "./notify";

describe("buildFeedbackPayload", () => {
  it("사진 여러 장을 'N장:' + 각 URL 줄로 노출", () => {
    const { text } = buildFeedbackPayload({
      category: "bug",
      body: "멈춤",
      userId: "u1",
      photoUrls: ["https://s/a.jpg", "https://s/b.jpg"],
    });
    expect(text).toContain("사진 2장:");
    expect(text).toContain("https://s/a.jpg");
    expect(text).toContain("https://s/b.jpg");
  });

  it("사진이 없으면 사진 줄을 넣지 않는다", () => {
    const { text } = buildFeedbackPayload({
      category: "other",
      body: "칭찬",
      userId: "u1",
      photoUrls: [],
    });
    expect(text).not.toContain("사진");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run apps/web/src/lib/slack/notify.spec.ts`
Expected: FAIL — 현재 타입은 `photoUrl`(단수).

- [ ] **Step 3: notify 수정**

`notify.ts`:

```ts
export type FeedbackSlackMessage = {
  category: FeedbackCategory;
  body: string;
  userId: string;
  email?: string | null;
  photoUrls?: string[];
};

export function buildFeedbackPayload(msg: FeedbackSlackMessage): { text: string } {
  const lines = [
    `${CATEGORY_LABEL[msg.category]} 건의가 도착했어요`,
    `>${msg.body.replaceAll("\n", "\n>")}`,
    `제출자: ${msg.email ?? "(email 없음)"} (${msg.userId})`,
  ];
  const urls = msg.photoUrls ?? [];
  if (urls.length > 0) {
    lines.push(`사진 ${urls.length}장:`);
    for (const u of urls) lines.push(u);
  }
  return { text: lines.join("\n") };
}
```

(`notifyFeedbackToSlack` 본문은 그대로 — `buildFeedbackPayload(msg)` 만 호출.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run apps/web/src/lib/slack/notify.spec.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/slack/notify.ts apps/web/src/lib/slack/notify.spec.ts
git commit -m "feat(slack): 건의 사진 N장 전부 #qa 노출"
```

---

## Task 5: 애널리틱스 — feedback_submitted

**Files:**

- Modify: `apps/web/src/lib/analytics/schema.ts`
- Modify: `apps/web/src/lib/analytics/schema-union-parity.spec.ts`

> union 멤버를 추가하면 parity 테스트가 fixture 를 요구한다.

- [ ] **Step 1: 이벤트 추가**

`schema.ts` 의 `z.discriminatedUnion("name", [ ... ])` 배열에 추가하고 상단에 import:

```ts
import { feedbackCategorySchema, MAX_FEEDBACK_PHOTOS } from "@withkey/domain";

// ...union 내부...
z.object({
  name: z.literal("feedback_submitted"),
  props: z.object({
    category: feedbackCategorySchema,
    photo_count: z.number().int().min(0).max(MAX_FEEDBACK_PHOTOS),
  }),
}),
```

- [ ] **Step 2: parity 실패 확인**

Run: `pnpm vitest run apps/web/src/lib/analytics/schema-union-parity.spec.ts`
Expected: FAIL — fixture 누락.

- [ ] **Step 3: fixture 추가**

parity 스펙의 fixture 맵에:

```ts
feedback_submitted: { name: "feedback_submitted", props: { category: "bug", photo_count: 2 } },
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run apps/web/src/lib/analytics`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/analytics/schema.ts apps/web/src/lib/analytics/schema-union-parity.spec.ts
git commit -m "feat(analytics): feedback_submitted 이벤트"
```

---

## Task 6: submitFeedback — 멀티 사진 + Slack 멀티 + analytics

**Files:**

- Modify: `apps/web/src/app/(app)/me/feedback/_actions.ts`
- Test: `apps/web/src/app/(app)/me/feedback/_actions.spec.ts`

> read 화면이 없으므로 `revalidateTag`·status 이벤트는 추가하지 않는다. `after()` 에서 photo_paths 전부 서명 → Slack 멀티 + analytics.

- [ ] **Step 1: 실패 테스트 추가**

`_actions.spec.ts` 에(기존 supabase/admin mock 재사용):

```ts
it("photos 여러 장을 photo_paths 로 저장한다", async () => {
  const fd = new FormData();
  fd.append("category", "bug");
  fd.append("body", "사진 두 장 테스트");
  fd.append("photos", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
  fd.append("photos", new File([new Uint8Array([2])], "b.png", { type: "image/png" }));

  const res = await submitFeedback(fd);
  expect(res.ok).toBe(true);
  // 단언: feedback.insert 페이로드 photo_paths.length === 2, photo_path === paths[0].
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run "apps/web/src/app/(app)/me/feedback/_actions.spec.ts"`
Expected: FAIL — 현재 단일 `photo` 만 처리.

- [ ] **Step 3: 액션 수정**

import 갱신:

```ts
import { feedbackSchema, MAX_FEEDBACK_PHOTOS, type FeedbackInput } from "@withkey/domain";
import { uploadFeedbackPhotos } from "@/lib/storage/feedback-photos";
import { track } from "@/lib/analytics/track";
```

`parseFormData` 의 사진 수신을 복수로 교체(구 단일 `photo` 흡수 포함):

```ts
const photos = formData.getAll("photos");
const single = formData.get("photo");
const files = [...photos, ...(single ? [single] : [])]
  .filter((v): v is File => v instanceof File && v.size > 0)
  .slice(0, MAX_FEEDBACK_PHOTOS);
return { ok: true, input: parsed.data, files };
```

(반환 타입 `file: File | null` → `files: File[]`.)

핸들러 업로드/insert 교체:

```ts
let photoPaths: string[] = [];
if (parsed.files.length > 0) {
  photoPaths = await uploadFeedbackPhotos({
    userId: user.id,
    feedbackId,
    files: parsed.files,
    client: supabase,
  });
}

const { error } = await supabase.from("feedback").insert({
  id: feedbackId,
  user_id: user.id,
  category: parsed.input.category,
  body: parsed.input.body,
  photo_path: photoPaths[0] ?? null, // deprecated 하위호환
  photo_paths: photoPaths,
});

if (error) {
  if (photoPaths.length > 0)
    await Promise.all(photoPaths.map((p) => deleteFeedbackPhoto(user.id, p, supabase)));
  return failure(mapSupabaseError(error));
}
```

`after()` 블록을 멀티 서명 + analytics 로 교체:

```ts
const slackInput = {
  category: parsed.input.category,
  body: parsed.input.body,
  userId: user.id,
  email: user.email,
};
after(async () => {
  try {
    const urls = (
      await Promise.all(photoPaths.map((p) => getFeedbackPhotoSignedUrl(p, adminClient())))
    ).filter((u): u is string => !!u);
    await notifyFeedbackToSlack({ ...slackInput, photoUrls: urls });
  } catch (e) {
    console.error("[submitFeedback] slack notify failed", e);
  }
  track({
    name: "feedback_submitted",
    props: { category: parsed.input.category, photo_count: photoPaths.length },
  });
});
```

(`notifyFeedbackToSlack` 호출 인자가 `photoUrl` → `photoUrls` 로 바뀐 점 확인. `track` 시그니처는 `apps/web/src/lib/analytics/track.ts` 의 export 에 맞춘다 — never-throw fire-and-forget.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run "apps/web/src/app/(app)/me/feedback/_actions.spec.ts"`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "apps/web/src/app/(app)/me/feedback/_actions.ts" "apps/web/src/app/(app)/me/feedback/_actions.spec.ts"
git commit -m "feat(feedback): 멀티 사진 저장 + Slack N장 노출 + analytics"
```

---

## Task 7: 작성 화면 — 단일→멀티(≤3) 타일 그리드

**Files:**

- Modify: `apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx`
- Test: `apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx`

> 시각/인터랙션/카피 SoT = `feedback-page-redesign.html`(A-only 정리본). 타일 그리드 `repeat(auto-fill, minmax(92px,1fr))`, `aspect-ratio:1`, 개별 삭제, 용량 태그, `n/3` 카운트, 3장 시 추가 타일 숨김. 완료 화면 CTA 는 **마이페이지로 돌아가기(`/me`)** — 내역 링크 없음.

- [ ] **Step 1: 실패 테스트 추가**

`feedback-form.spec.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeedbackForm } from "./feedback-form";

vi.mock("../_actions", () => ({
  submitFeedback: vi.fn(async () => ({ ok: true, data: { ok: true } })),
}));
const png = (n: string) => new File([new Uint8Array([1, 2, 3])], n, { type: "image/png" });

describe("FeedbackForm 멀티 사진", () => {
  it("여러 장 추가 시 썸네일이 장수만큼 보이고 3장이면 추가 타일이 사라진다", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png("a.png"), png("b.png"), png("c.png")] } });
    expect(await screen.findAllByRole("img")).toHaveLength(3);
    expect(screen.queryByTestId("feedback-photo-add")).toBeNull();
  });

  it("4번째부터는 무시(최대 3)", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [png("a.png"), png("b.png"), png("c.png"), png("d.png")] },
    });
    expect(await screen.findAllByRole("img")).toHaveLength(3);
  });

  it("썸네일 제거 버튼으로 한 장을 지운다", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png("a.png")] } });
    fireEvent.click(await screen.findByLabelText("사진 제거"));
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run "apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx"`
Expected: FAIL — 단일 `file` 상태/testid 없음.

- [ ] **Step 3: 폼 멀티화**

단일 상태를 배열로 교체:

```tsx
import { MAX_PHOTO_BYTES, MAX_FEEDBACK_PHOTOS } from "@withkey/domain";

type Picked = { file: File; url: string };
const [photos, setPhotos] = useState<Picked[]>([]);

async function onPickPhotos(list: FileList | null) {
  if (!list) return;
  const room = MAX_FEEDBACK_PHOTOS - photos.length;
  const next: Picked[] = [];
  for (const f of Array.from(list).slice(0, room)) {
    if (f.size > MAX_PHOTO_BYTES) {
      toast.error("사진은 5MB 이하만 올릴 수 있어요.");
      continue;
    }
    if (!isAllowedFile(f)) {
      toast.error("지원하지 않는 이미지 형식이에요.");
      continue;
    }
    const prepared = await prepareForUpload(f);
    next.push({ file: prepared, url: URL.createObjectURL(prepared) });
  }
  setPhotos((prev) => [...prev, ...next]);
}

function removePhoto(i: number) {
  setPhotos((prev) => {
    URL.revokeObjectURL(prev[i].url);
    return prev.filter((_, idx) => idx !== i);
  });
}

useEffect(
  () => () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
  },
  [],
); // 언마운트 cleanup
```

제출부 사진을 복수 append:

```tsx
const fd = new FormData();
fd.append("category", category);
fd.append("body", body);
for (const p of photos) fd.append("photos", p.file);
```

마크업의 사진 섹션을 `feedback-page-redesign.html` 의 타일 그리드로 교체. 필수 hook:

- 썸네일 `photos[i]`: `<img src={p.url}>` + `aria-label="사진 제거"` 버튼(`removePhoto(i)`) + 용량 태그.
- 추가 타일: `data-testid="feedback-photo-add"`, `photos.length >= MAX_FEEDBACK_PHOTOS` 면 미렌더, 클릭 시 hidden input click, 라벨 `{photos.length}/{MAX_FEEDBACK_PHOTOS}`.
- hidden input: `data-testid="feedback-photo-input"`, `multiple`, `accept={ACCEPT}`, `onChange={(e) => void onPickPhotos(e.target.files)}`.

완료(`done`) 액션은 정리본대로 "마이페이지로 돌아가기"(`Link href="/me"` + `buttonVariants({ variant: "outline" })`) + "하나 더 보내기"(폼 리셋: photos revoke 후 비우기). **내역 링크는 넣지 않는다.**

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run "apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx"`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx" "apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx"
git commit -m "feat(feedback): 작성 화면 멀티 사진(≤3) 타일 그리드"
```

---

## Task 8: 통합 검증

- [ ] **Step 1: 단위/타입/린트**

Run:
`pnpm vitest run packages/domain apps/web/src/lib/storage/feedback-photos.spec.ts apps/web/src/lib/slack/notify.spec.ts apps/web/src/lib/analytics "apps/web/src/app/(app)/me/feedback"`
이어서 저장소의 `check`(타입+린트+테스트) / `build-check`(프로덕션 빌드).
Expected: 모두 green.

- [ ] **Step 2: 수동 E2E(실 기기/로컬)**

1. `/me/feedback` — 분류 선택 → 본문 입력 → 사진 3장 첨부(타일 3개, `3/5` 아닌 **`3/3`**, 추가 타일 사라짐) → 1장 삭제(`2/3`, 추가 타일 복귀) → 보내기 → stamp 완료 → "마이페이지로 돌아가기".
2. Slack **#qa** 확인 — "사진 2장:" + 서명 URL 2개가 모두 열림.
3. Supabase Studio — 해당 feedback 행 `photo_paths` 2개, `photo_path` = 첫 장.
4. analytics events 테이블 — `feedback_submitted { category, photo_count: 2 }` 1행.

Expected: 정리본 디자인과 동작 일치 + #qa 멀티 노출.

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/plans/2026-06-18-feedback-multi-photo.md
git commit -m "docs(plan): 건의 멀티 사진 A-only 최종 계획"
```

---

## Self-Review

**Spec coverage**

- 멀티 사진(≤3): Task 1(상수)·2(DB array+check)·3(storage)·6(action)·7(UI). ✓
- 사진 실수신처(#qa) 멀티 노출: Task 4·6(after 서명). ✓
- 작성 화면 개선(정리본): Task 7 이 A-only `feedback-page-redesign.html` 을 SoT 로. ✓
- ADR 거버넌스(1→3 동작 변경): Task 2 amendment. ✓
- ADR-0035 읽기 자세 유지(B 미구현): RLS/status/열람 미변경 — File Structure "건드리지 않음" 명시. ✓

**Placeholder scan** — 각 단계에 실제 코드/SQL/명령. 미지(저장소 check 명령, parity fixture 맵 위치, track 시그니처)는 "관례 확인" 지시로 명시, 추정 코드 미삽입.

**Type consistency** — `MAX_FEEDBACK_PHOTOS`(domain) → analytics·action·form 일치. `uploadFeedbackPhotos`(Task 3) 시그니처 = Task 6 호출. `photoUrls`(Task 4) = Task 6 `notifyFeedbackToSlack` 인자. `photo_paths` 컬럼명이 0049·action 일치.

**범위 밖(후속 별도 계획) — 트랙 B**: 내 건의 내역 / 처리 상태 타임라인 / 개발팀 답변. 착수 게이트 = ⑴ ADR-0035 결정 1번(열람 화면 없음) 정식 개정 + ⑵ status 를 갱신할 트리아지 담당/주기 확정. 디자인 자산은 보존됨(`feedback-history.html`, `feedback-redesign-hub.html`).
