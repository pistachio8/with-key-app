# 개발자에게 건의하기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 사용자가 `/me/feedback`에서 카테고리+본문+선택적 사진 1장을 제출하면 `feedback` 테이블(SoT)에 저장되고 Slack #qa로 best-effort 알림이 간다.

**Architecture:** 신규 `feedback` 테이블(INSERT-only RLS) + 신규 private `feedback-photos` 버킷(owner-scoped RLS). Server Action이 zod 검증 → 사진 업로드 선행(비파괴 폴백) → insert → `after()`에서 Slack POST(2.5s 타임아웃, never-throw). spec: [2026-06-10-feedback-suggestion-design.md](../specs/2026-06-10-feedback-suggestion-design.md)

**Tech Stack:** Next.js 16 App Router · Supabase (RLS/Storage) · zod(`@withkey/domain`) · Vitest · Slack Incoming Webhook

**테스트 실행 위치:** `packages/domain`은 `pnpm --filter @withkey/domain test`, `apps/web`은 `cd apps/web && pnpm vitest run --project unit <파일경로>` (전체는 루트 `pnpm test`).

---

### Task 1: 도메인 validator — `feedbackSchema`

**Files:**
- Create: `packages/domain/src/validators/feedback.ts`
- Create: `packages/domain/src/validators/feedback.spec.ts`
- Modify: `packages/domain/src/validators/index.ts` (export 1줄)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/domain/src/validators/feedback.spec.ts
import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORIES, feedbackSchema } from "./feedback";

describe("feedbackSchema", () => {
  it("accepts a valid input", () => {
    const res = feedbackSchema.safeParse({ category: "bug", body: "버그가 있어요" });
    expect(res.success).toBe(true);
  });

  it("trims body and rejects empty-after-trim", () => {
    expect(feedbackSchema.safeParse({ category: "other", body: "   " }).success).toBe(false);
  });

  it("rejects body over 1000 chars", () => {
    expect(feedbackSchema.safeParse({ category: "feature", body: "a".repeat(1001) }).success).toBe(
      false,
    );
  });

  it("accepts body of exactly 1000 chars", () => {
    expect(feedbackSchema.safeParse({ category: "feature", body: "a".repeat(1000) }).success).toBe(
      true,
    );
  });

  it("rejects unknown category", () => {
    expect(feedbackSchema.safeParse({ category: "spam", body: "hi" }).success).toBe(false);
  });

  it("FEEDBACK_CATEGORIES matches the DB check constraint set", () => {
    // migration 0047 의 check (category in ('bug','feature','other')) 와 1:1
    expect(FEEDBACK_CATEGORIES).toEqual(["bug", "feature", "other"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @withkey/domain test -- feedback`
Expected: FAIL — `Cannot find module './feedback'`

- [ ] **Step 3: 최소 구현**

```ts
// packages/domain/src/validators/feedback.ts
// 개발자에게 건의하기 입력 — spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md
// migration 0047 의 check 제약(category in / char_length 1..1000)과 1:1 동기.
import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["bug", "feature", "other"] as const;
export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSchema = z.object({
  category: feedbackCategorySchema,
  body: z.string().trim().min(1).max(1000),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
```

`packages/domain/src/validators/index.ts`의 barrel에 추가 (알파벳 순서 유지 — challenge 다음):

```ts
export * from "./feedback";
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @withkey/domain test -- feedback`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/domain/src/validators/feedback.ts packages/domain/src/validators/feedback.spec.ts packages/domain/src/validators/index.ts
git commit -m "feat(domain): feedbackSchema validator 추가 — 건의 카테고리·본문 zod SoT"
```

---

### Task 2: migration `0047_feedback.sql`

**Files:**
- Create: `supabase/migrations/0047_feedback.sql`

migration은 단위 테스트가 없다 — 검증은 Task 9의 CI Integration(공유 Supabase db push)과 RLS 실측. **주의**: `truncate_test_data` 재발행은 반드시 0012 정의 전문 기반(아래 SQL이 이미 반영) — 0011 기반으로 하면 `storage.allow_delete_query` 플래그가 빠져 함수가 실패한다.

- [ ] **Step 1: migration 파일 작성**

```sql
-- 0047_feedback.sql — 개발자에게 건의하기: feedback 테이블 + feedback-photos 버킷 + RLS.
-- spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md
-- ADR : docs/adr/0034-feedback-table-storage.md

-- ============================================================
-- 1. feedback 테이블 (13번째)
-- ============================================================
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  category   text not null check (category in ('bug','feature','other')),
  body       text not null check (char_length(body) between 1 and 1000),
  photo_path text,
  created_at timestamptz not null default now()
);

comment on column public.feedback.photo_path is
  'feedback-photos bucket object path "{userId}/{feedbackId}-{nonce}.{ext}". NULL = no photo.';

alter table public.feedback enable row level security;

-- INSERT-only: 앱에 열람 화면이 없어 SELECT/UPDATE/DELETE 정책을 두지 않는다.
-- 개발자 조회는 Supabase Studio(service_role). insert 후 .select() 체이닝은 RLS 에 막히므로
-- Server Action 이 id 를 randomUUID() 로 선생성한다.
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================
-- 2. private feedback-photos 버킷
--    action-photos 재사용 불가: 그쪽 SELECT 정책이 챌린지 그룹 멤버 기준.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-photos',
  'feedback-photos',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 3. storage.objects RLS — owner-scoped
--    path: {userId}/{feedbackId}-{nonce}.{ext} (2-segment, foldername[1] = userId)
-- ============================================================
drop policy if exists fp_insert_self on storage.objects;
create policy fp_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists fp_select_self on storage.objects;
create policy fp_select_self on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists fp_delete_self on storage.objects;
create policy fp_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 4. truncate_test_data 재발행 — 0012 정의 전문 보존 + feedback 확장 2곳:
--    (a) storage delete 의 bucket 스코프에 feedback-photos 추가
--    (b) delete from public.feedback (auth.users 삭제 이전)
--    참고: point_ledger·settlements 미정리는 기존 잠복 결함 — 본 migration 범위 외,
--    ADR-0034 에 인지 기록 (별도 forward-fix).
-- ============================================================
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public, storage as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    -- Bypass storage.protect_delete trigger (session-local; service_role only).
    perform set_config('storage.allow_delete_query', 'true', true);

    delete from storage.objects
      where bucket_id in ('action-photos', 'feedback-photos')
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

    delete from public.feedback where user_id = any(v_test_user_ids);
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);
    delete from public.challenge_participants where user_id = any(v_test_user_ids);
    delete from public.challenges where group_id in (
      select id from public.groups where owner_id = any(v_test_user_ids)
    );
    delete from public.invites where created_by = any(v_test_user_ids);
    delete from public.group_members where user_id = any(v_test_user_ids);
    delete from public.groups where owner_id = any(v_test_user_ids);
    delete from public.push_subscriptions where user_id = any(v_test_user_ids);
    delete from public.events where user_id = any(v_test_user_ids);
    delete from auth.users where id = any(v_test_user_ids);
  end if;

  -- D-017: anon events (user_id IS NULL) within 24h — test anon leaks only,
  -- preserve older prod analytics.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- D-017: reset scope='test' current-month AI cost accumulator.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;
```

- [ ] **Step 2: 파일명·번호 검증**

Run: `ls supabase/migrations/ | tail -3`
Expected: `0045_…`, `0046_…`, `0047_feedback.sql` — 0047이 마지막(append-only 확인)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0047_feedback.sql
git commit -m "feat(db): feedback 테이블 + feedback-photos 버킷 + RLS (0047)"
```

---

### Task 3: ADR-0034 + BE_SCHEMA + .env.example 문서

**Files:**
- Create: `docs/adr/0034-feedback-table-storage.md`
- Modify: `docs/BE_SCHEMA.md` (§2 인벤토리 표 + §5 컬럼 상세 + §7 RLS 요약 + §12 Changelog)
- Modify: `apps/web/.env.example` (Slack 블록 아래 추가)

- [ ] **Step 1: ADR 작성**

`pnpm new adr feedback-table-storage`로 scaffold 후(번호 자동 부여 — 0034 확인) 아래 내용으로 채운다:

```markdown
# ADR-0034: feedback 테이블 + feedback-photos Storage (개발자에게 건의하기)

- Status: Accepted
- Date: 2026-06-10
- 관련: spec docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md · migration 0047

## Context

dogfood 건의·버그 리포트가 카톡/구두로 흩어진다. 앱 내 제출 → DB 보존 → Slack #qa 인지가 필요하다.

## Decision

1. **feedback 테이블 INSERT-only RLS** — 앱에 열람 화면이 없어 SELECT/UPDATE/DELETE 정책을 두지 않는다(노출면 최소화). 개발자는 service_role 로 조회. insert 후 `.select()` 가 RLS 에 막히므로 id 는 Server Action 이 선생성한다.
2. **신규 private 버킷 feedback-photos (owner-scoped RLS)** — 기존 action-photos 의 SELECT 정책이 챌린지 그룹 멤버 기준이라 부적합.
3. **사진 업로드 선행 → insert** — INSERT-only RLS 라 insert-후-update 경로가 없다. orphan row 대신 orphan object 를 택하고, insert 실패 시 best-effort remove 로 정리한다.
4. **Slack signed URL 은 adminClient 로 TTL 72h** — #qa 내부 한정 노출. ADR-0024 위반 아님(user-facing cache 에 admin 결과 저장이 아니라 1회성 URL 생성).
5. **truncate_test_data 는 0012 정의 기반 재발행** — `storage.allow_delete_query` 플래그 보존 + feedback 정리 추가.

## Consequences

- 사진 orphan object 가 드물게 잔존 가능(insert 실패 + remove 실패) — 빈도 낮음, Studio 정리로 충분.
- (인지 기록) truncate_test_data 가 point_ledger·settlements 를 정리하지 않는 기존 잠복 결함 발견 — 본 ADR 범위 외, 별도 forward-fix 필요.
```

- [ ] **Step 2: BE_SCHEMA.md 갱신**

§2 표에 13번째 행 추가:

```markdown
| 13  | `feedback`               | 개발자에게 건의 (카테고리·본문·사진)            | dogfood 운영 |
```

§2 표 제목 `## 2. 테이블 인벤토리 (12개)` → `(13개)`. §5에 `### 5.11 \`feedback\`` 섹션(컬럼 표 — Task 2 SQL과 1:1), §7 RLS 요약에 `feedback: INSERT-only (user_id = auth.uid()), SELECT/UPDATE/DELETE 없음` 1줄, §12 Changelog에 `2026-06-10 — feedback 테이블 추가 (0047, ADR-0034)` 추가.

- [ ] **Step 3: .env.example 갱신**

기존 `SLACK_RELEASE_WEBHOOK_URL=` 줄 아래에 추가:

```bash
# 개발자에게 건의하기(/me/feedback) 제출을 #qa 로 알리는 Slack Incoming Webhook URL.
# 서버 전용 — NEXT_PUBLIC_ 접두 금지(웹훅 URL 자체가 발송 권한). 미설정 시 알림만 skip(제출은 정상).
SLACK_FEEDBACK_WEBHOOK_URL=
```

- [ ] **Step 4: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: `OK: no broken references`

- [ ] **Step 5: 커밋**

```bash
git add docs/adr/0034-feedback-table-storage.md docs/BE_SCHEMA.md apps/web/.env.example
git commit -m "docs(adr): ADR-0034 feedback 테이블·Storage 결정 + BE_SCHEMA·env 동기"
```

---

### Task 4: Storage 헬퍼 — `feedback-photos.ts`

**Files:**
- Create: `apps/web/src/lib/storage/feedback-photos.ts`
- Create: `apps/web/src/lib/storage/feedback-photos.spec.ts`

`extFromFile`은 `action-photos.ts`에서 재사용(경로 무관 로직 — DRY). path 빌더·업로드·signed URL·삭제는 2-segment 경로·버킷이 달라 신설.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/web/src/lib/storage/feedback-photos.spec.ts
import { describe, expect, it } from "vitest";
import {
  buildFeedbackPhotoPath,
  looksLikeFeedbackPhotoPath,
  FEEDBACK_SIGNED_URL_TTL_SECONDS,
} from "./feedback-photos";

describe("buildFeedbackPhotoPath", () => {
  it("composes the 2-segment Storage path", () => {
    const path = buildFeedbackPhotoPath({
      userId: "user-1",
      feedbackId: "fb-1",
      ext: "jpg",
      nonce: "abcd",
    });
    expect(path).toBe("user-1/fb-1-abcd.jpg");
  });

  it("rejects traversal segments", () => {
    expect(() =>
      buildFeedbackPhotoPath({ userId: "../etc", feedbackId: "fb-1", ext: "jpg", nonce: "a" }),
    ).toThrow(/invalid/i);
  });

  it("rejects unsupported extensions (including heic)", () => {
    for (const ext of ["exe", "heic", "heif"]) {
      expect(() =>
        buildFeedbackPhotoPath({ userId: "u", feedbackId: "f", ext, nonce: "a" }),
      ).toThrow(/extension/);
    }
  });
});

describe("looksLikeFeedbackPhotoPath", () => {
  it("accepts the canonical 2-segment path", () => {
    expect(looksLikeFeedbackPhotoPath("user-1/fb-1-abcd.jpg")).toBe(true);
  });

  it("rejects URLs, 3-segment paths, and null", () => {
    expect(looksLikeFeedbackPhotoPath("https://x.com/a/b.jpg")).toBe(false);
    expect(looksLikeFeedbackPhotoPath("u/c/log-1-a.jpg")).toBe(false);
    expect(looksLikeFeedbackPhotoPath(null)).toBe(false);
  });
});

describe("FEEDBACK_SIGNED_URL_TTL_SECONDS", () => {
  it("is 72 hours (spec C5)", () => {
    expect(FEEDBACK_SIGNED_URL_TTL_SECONDS).toBe(72 * 60 * 60);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts`
Expected: FAIL — `Cannot find module './feedback-photos'`

- [ ] **Step 3: 구현**

```ts
// apps/web/src/lib/storage/feedback-photos.ts
// 건의 사진 Storage 헬퍼 — spec C2. action-photos 와 분리: 버킷·경로 규격(2-segment)이 다르다.
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTO_BYTES } from "@withkey/domain";
import { extFromFile } from "./action-photos";

const BUCKET = "feedback-photos";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
// {userId}/{feedbackId}-{nonce}.{ext}
const FEEDBACK_PHOTO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i;

// Slack #qa 트리아지용 — 내부 채널 한정 노출이라 앱 피드(600s)보다 길게 둔다 (ADR-0034).
export const FEEDBACK_SIGNED_URL_TTL_SECONDS = 72 * 60 * 60;

export function looksLikeFeedbackPhotoPath(value: string | null | undefined): value is string {
  if (!value || value.includes("://")) return false;
  return FEEDBACK_PHOTO_PATH_RE.test(value);
}

export function buildFeedbackPhotoPath(opts: {
  userId: string;
  feedbackId: string;
  ext: string;
  nonce?: string;
}): string {
  const nonce = opts.nonce ?? randomUUID().replaceAll("-", "").slice(0, 12);
  const ext = opts.ext.toLowerCase();

  for (const segment of [opts.userId, opts.feedbackId, nonce]) {
    if (!SEGMENT_RE.test(segment)) {
      throw new Error(`invalid path segment: ${segment}`);
    }
  }
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    throw new Error(`photo extension not allowed: ${ext}`);
  }

  return `${opts.userId}/${opts.feedbackId}-${nonce}.${ext}`;
}

export type UploadFeedbackPhotoResult =
  | { ok: true; path: string }
  | { ok: false; reason: "mime" | "size" | "upload_failed" };

export async function uploadFeedbackPhoto(args: {
  userId: string;
  feedbackId: string;
  file: File;
  client?: SupabaseClient;
}): Promise<UploadFeedbackPhotoResult> {
  const { userId, feedbackId, file } = args;

  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "size" };
  }

  let ext: string;
  try {
    ext = extFromFile(file);
  } catch {
    return { ok: false, reason: "mime" };
  }

  const path = buildFeedbackPhotoPath({ userId, feedbackId, ext });
  const supabase = args.client ?? (await createClient());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) {
    console.error("[uploadFeedbackPhoto] storage upload failed", { path, error });
    return { ok: false, reason: "upload_failed" };
  }

  return { ok: true, path };
}

export async function getFeedbackPhotoSignedUrl(
  path: string | null | undefined,
  client: SupabaseClient,
): Promise<string | null> {
  if (!looksLikeFeedbackPhotoPath(path)) return null;
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, FEEDBACK_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function deleteFeedbackPhoto(
  userId: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;
  const supabase = client ?? (await createClient());
  await supabase.storage.from(BUCKET).remove([path]);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/web && pnpm vitest run --project unit src/lib/storage/feedback-photos.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/storage/feedback-photos.ts apps/web/src/lib/storage/feedback-photos.spec.ts
git commit -m "feat(storage): feedback-photos 업로드·signed URL·삭제 헬퍼 (2-segment path)"
```

---

### Task 5: Slack 알림 헬퍼 — `lib/slack/notify.ts`

**Files:**
- Create: `apps/web/src/lib/slack/notify.ts`
- Create: `apps/web/src/lib/slack/notify.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/web/src/lib/slack/notify.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedbackPayload, notifyFeedbackToSlack } from "./notify";

const BASE = {
  category: "bug" as const,
  body: "제출 버튼이 안 눌려요",
  userId: "11111111-1111-1111-1111-111111111111",
  email: "u@test.local",
  photoUrl: null,
};

describe("buildFeedbackPayload", () => {
  it("includes category label, body, and submitter", () => {
    const payload = buildFeedbackPayload(BASE);
    const text = JSON.stringify(payload);
    expect(text).toContain("버그");
    expect(text).toContain("제출 버튼이 안 눌려요");
    expect(text).toContain("u@test.local");
  });

  it("includes the photo link only when photoUrl is set", () => {
    expect(JSON.stringify(buildFeedbackPayload(BASE))).not.toContain("사진");
    expect(
      JSON.stringify(buildFeedbackPayload({ ...BASE, photoUrl: "https://signed.example/x" })),
    ).toContain("https://signed.example/x");
  });
});

describe("notifyFeedbackToSlack", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips silently when env is unset", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "");
    await notifyFeedbackToSlack(BASE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the webhook when env is set", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "https://hooks.slack.test/abc");
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    await notifyFeedbackToSlack(BASE);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.slack.test/abc");
  });

  it("never throws on fetch failure", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "https://hooks.slack.test/abc");
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(notifyFeedbackToSlack(BASE)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts`
Expected: FAIL — `Cannot find module './notify'`

- [ ] **Step 3: 구현**

```ts
// apps/web/src/lib/slack/notify.ts
// 건의 제출 Slack #qa 알림 — spec C5. never-throw(track() 철학): 알림 실패가 제출을 뒤집지 않는다.
import "server-only";
import type { FeedbackCategory } from "@withkey/domain";

const TIMEOUT_MS = 2500;

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "🐞 버그",
  feature: "💡 기능 제안",
  other: "💬 기타",
};

export type FeedbackSlackMessage = {
  category: FeedbackCategory;
  body: string;
  userId: string;
  email?: string | null;
  photoUrl?: string | null;
};

export function buildFeedbackPayload(msg: FeedbackSlackMessage): { text: string } {
  const lines = [
    `${CATEGORY_LABEL[msg.category]} 건의가 도착했어요`,
    `>${msg.body.replaceAll("\n", "\n>")}`,
    `제출자: ${msg.email ?? "(email 없음)"} (${msg.userId})`,
  ];
  if (msg.photoUrl) lines.push(`사진: ${msg.photoUrl}`);
  return { text: lines.join("\n") };
}

export async function notifyFeedbackToSlack(msg: FeedbackSlackMessage): Promise<void> {
  const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildFeedbackPayload(msg)),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[notifyFeedbackToSlack] non-2xx", { status: res.status });
    }
  } catch (error) {
    console.error("[notifyFeedbackToSlack] failed", error);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/web && pnpm vitest run --project unit src/lib/slack/notify.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/slack/notify.ts apps/web/src/lib/slack/notify.spec.ts
git commit -m "feat(slack): 건의 알림 webhook 헬퍼 — 2.5s 타임아웃 never-throw"
```

---

### Task 6: Server Action — `submitFeedback`

**Files:**
- Create: `apps/web/src/app/(app)/me/feedback/_actions.ts`
- Create: `apps/web/src/app/(app)/me/feedback/_actions.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

기존 `me/_actions.spec.ts`의 모킹 스타일(모듈 mock + 테이블 분기)을 따른다. `after()`는 즉시 실행으로 mock해 Slack 경로를 동기 검증한다.

```ts
// apps/web/src/app/(app)/me/feedback/_actions.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const insert = vi.fn<(row: object) => Promise<{ error: unknown }>>();
const uploadFeedbackPhoto = vi.fn();
const deleteFeedbackPhoto = vi.fn();
const getFeedbackPhotoSignedUrl = vi.fn();
const notifyFeedbackToSlack = vi.fn();

vi.mock("next/server", () => ({
  // after() 콜백을 즉시 실행 — Slack 경로를 동기 검증하기 위함.
  after: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: USER_ID, email: "u@test.local" } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "feedback") return { insert: (row: object) => insert(row) };
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

vi.mock("@/lib/storage/feedback-photos", () => ({
  uploadFeedbackPhoto: (...a: unknown[]) => uploadFeedbackPhoto(...a),
  deleteFeedbackPhoto: (...a: unknown[]) => deleteFeedbackPhoto(...a),
  getFeedbackPhotoSignedUrl: (...a: unknown[]) => getFeedbackPhotoSignedUrl(...a),
}));

vi.mock("@/lib/slack/notify", () => ({
  notifyFeedbackToSlack: (...a: unknown[]) => notifyFeedbackToSlack(...a),
}));

import { submitFeedback } from "./_actions";

function makeFormData(over: Partial<Record<"category" | "body", string>> = {}, photo?: File) {
  const fd = new FormData();
  fd.append("category", over.category ?? "bug");
  fd.append("body", over.body ?? "버그 신고");
  if (photo) fd.append("photo", photo);
  return fd;
}

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  uploadFeedbackPhoto.mockReset();
  deleteFeedbackPhoto.mockReset();
  getFeedbackPhotoSignedUrl.mockReset().mockResolvedValue(null);
  notifyFeedbackToSlack.mockReset().mockResolvedValue(undefined);
});

describe("submitFeedback", () => {
  it("inserts feedback and notifies Slack on success", async () => {
    const res = await submitFeedback(makeFormData());
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        category: "bug",
        body: "버그 신고",
        photo_path: null,
        id: expect.any(String),
      }),
    );
    expect(notifyFeedbackToSlack).toHaveBeenCalledOnce();
  });

  it("rejects invalid input without touching DB", async () => {
    const res = await submitFeedback(makeFormData({ body: "   " }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(insert).not.toHaveBeenCalled();
  });

  it("falls back to body-only when photo upload fails (non-destructive)", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: false, reason: "mime" });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ photo_path: null }));
  });

  it("stores photo_path when upload succeeds", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: true, path: `${USER_ID}/fb-abc.jpg` });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ photo_path: `${USER_ID}/fb-abc.jpg` }),
    );
  });

  it("removes the orphan object when insert fails after upload", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: true, path: `${USER_ID}/fb-abc.jpg` });
    insert.mockResolvedValue({ error: { code: "23514" } });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(false);
    expect(deleteFeedbackPhoto).toHaveBeenCalledWith(
      USER_ID,
      `${USER_ID}/fb-abc.jpg`,
      expect.anything(),
    );
    expect(notifyFeedbackToSlack).not.toHaveBeenCalled();
  });

  it("keeps success when Slack notify rejects", async () => {
    notifyFeedbackToSlack.mockRejectedValue(new Error("slack down"));
    const res = await submitFeedback(makeFormData());
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"`
Expected: FAIL — `Cannot find module './_actions'`

- [ ] **Step 3: 구현**

```ts
// apps/web/src/app/(app)/me/feedback/_actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { ZodError } from "zod";
import { feedbackSchema, type FeedbackInput } from "@withkey/domain";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  deleteFeedbackPhoto,
  getFeedbackPhotoSignedUrl,
  uploadFeedbackPhoto,
} from "@/lib/storage/feedback-photos";
import { notifyFeedbackToSlack } from "@/lib/slack/notify";

function parseFormData(
  formData: FormData,
):
  | { ok: true; input: FeedbackInput; file: File | null }
  | { ok: false; error: ZodError<FeedbackInput> } {
  const raw = {
    category: String(formData.get("category") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };

  const maybeFile = formData.get("photo");
  const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
  return { ok: true, input: parsed.data, file };
}

// spec C4 — 사진 업로드 선행: INSERT-only RLS 라 insert 후 photo_path UPDATE 경로가 없다.
// id 선생성: SELECT 정책이 없어 insert(...).select() 가 RLS 에 막힌다 (ADR-0034).
export const submitFeedback = withUser<FormData, { ok: true }>(
  async (user, formData): Promise<ActionResult<{ ok: true }>> => {
    const parsed = parseFormData(formData);
    if (!parsed.ok) return validationFailure(parsed.error);

    const supabase = await createClient();
    const feedbackId = randomUUID();

    let photoPath: string | null = null;
    if (parsed.file) {
      const upload = await uploadFeedbackPhoto({
        userId: user.id,
        feedbackId,
        file: parsed.file,
        client: supabase,
      });
      if (upload.ok) {
        photoPath = upload.path;
      } else {
        // 비파괴 폴백 — 본문만 저장하고 제출은 성공시킨다.
        console.warn("[submitFeedback] uploadFeedbackPhoto failed", {
          feedbackId,
          reason: upload.reason,
        });
      }
    }

    const { error } = await supabase.from("feedback").insert({
      id: feedbackId,
      user_id: user.id,
      category: parsed.input.category,
      body: parsed.input.body,
      photo_path: photoPath,
    });

    if (error) {
      // orphan object 정리 (best-effort) — 업로드 선행의 트레이드오프 (ADR-0034).
      if (photoPath) await deleteFeedbackPhoto(user.id, photoPath, supabase);
      return failure(mapSupabaseError(error));
    }

    // Slack 알림은 응답 latency 와 분리 — submitActionLog 의 push 패턴과 동형.
    const slackInput = {
      category: parsed.input.category,
      body: parsed.input.body,
      userId: user.id,
      email: user.email,
    };
    after(async () => {
      try {
        const photoUrl = photoPath
          ? await getFeedbackPhotoSignedUrl(photoPath, adminClient())
          : null;
        await notifyFeedbackToSlack({ ...slackInput, photoUrl });
      } catch (e) {
        // notifyFeedbackToSlack 은 never-throw 지만 signed URL 생성 실패까지 방어.
        console.error("[submitFeedback] slack notify failed", e);
      }
    });

    return success({ ok: true });
  },
);
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/web && pnpm vitest run --project unit "src/app/(app)/me/feedback/_actions.spec.ts"`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add "apps/web/src/app/(app)/me/feedback/_actions.ts" "apps/web/src/app/(app)/me/feedback/_actions.spec.ts"
git commit -m "feat(me): submitFeedback Server Action — 업로드 선행·orphan 정리·after() Slack"
```

---

### Task 7: UI — `/me/feedback` 페이지 + 폼

**Files:**
- Create: `apps/web/src/app/(app)/me/feedback/page.tsx`
- Create: `apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx`

클라이언트 컴포넌트 UI는 단위 테스트 대신 Task 9의 모바일 viewport 수동 검증으로 커버한다(레포 관행 — `action-form.tsx`도 동일).

- [ ] **Step 1: page.tsx 작성**

```tsx
// apps/web/src/app/(app)/me/feedback/page.tsx
// 개발자에게 건의하기 — spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md

import { requireUser } from "@/lib/auth/require-user";
import { FeedbackForm } from "./_components/feedback-form";

export default async function FeedbackPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="t-h1">개발자에게 건의하기</h1>
      <p className="t-body text-muted-foreground">
        버그 제보나 아이디어를 보내주세요. 보내주신 내용은 개발팀이 바로 확인해요.
      </p>
      <FeedbackForm />
    </div>
  );
}
```

- [ ] **Step 2: feedback-form.tsx 작성**

```tsx
// apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  ALLOWED_PHOTO_MIME,
  FEEDBACK_CATEGORIES,
  MAX_PHOTO_BYTES,
  type FeedbackCategory,
} from "@withkey/domain";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import { submitFeedback } from "../_actions";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "버그 제보",
  feature: "기능 제안",
  other: "기타",
};

const MAX_BODY = 1000;
// HEIC/HEIF 는 입력으로 받고 prepareForUpload 가 JPEG 으로 변환한다 (action-form 과 동일).
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

function isAllowedFile(file: File): boolean {
  if (!file.type) return false;
  if ((ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) return true;
  return /^image\/hei[cf]$/i.test(file.type);
}

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onPickPhoto(next: File | null) {
    if (!next) return;
    if (next.size > MAX_PHOTO_BYTES) {
      toast.error("사진은 5MB 이하만 올릴 수 있어요.");
      clearPhoto();
      return;
    }
    if (!isAllowedFile(next)) {
      toast.error("지원하지 않는 이미지 형식이에요.");
      clearPhoto();
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareForUpload(next);
      if (preview) URL.revokeObjectURL(preview);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
    } finally {
      setPreparing(false);
    }
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("category", category);
      fd.append("body", body);
      if (file) fd.append("photo", file);

      const res = await submitFeedback(fd);
      if (!res.ok) {
        toast.error(
          res.error === "invalid_input"
            ? "입력 내용을 다시 확인해주세요."
            : "전송에 실패했어요. 잠시 후 다시 시도해주세요.",
        );
        return;
      }
      clearPhoto();
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="text-primary size-10" aria-hidden="true" />
        <p className="t-h2">전달됐어요</p>
        <p className="t-body text-muted-foreground">소중한 의견 감사합니다. 꼼꼼히 읽어볼게요.</p>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/me">마이페이지로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const submittable = body.trim().length > 0 && !pending && !preparing;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-category" className="t-caption">
          분류
        </label>
        <Select
          id="feedback-category"
          value={category}
          onValueChange={(v) => {
            if (v && (FEEDBACK_CATEGORIES as readonly string[]).includes(v)) {
              setCategory(v as FeedbackCategory);
            }
          }}
          items={CATEGORY_LABELS}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-body" className="t-caption">
          내용
        </label>
        <Textarea
          id="feedback-body"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          placeholder="불편했던 점이나 바라는 점을 적어주세요"
          className="min-h-36"
        />
        <p className="t-caption text-muted-foreground self-end">
          {body.length}/{MAX_BODY}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="t-caption">사진 (선택)</span>
        {preview ? (
          <div className="relative w-fit">
            {/* 로컬 blob 미리보기 — next/image 최적화 대상 아님 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="첨부 사진 미리보기" className="max-h-48 rounded-lg" />
            <button
              type="button"
              onClick={clearPhoto}
              aria-label="사진 제거"
              className="bg-foreground/70 text-background absolute top-1.5 right-1.5 rounded-full p-1"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={preparing}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {preparing ? "사진 처리 중..." : "사진 첨부"}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button type="button" disabled={!submittable} onClick={submit}>
        {pending ? "보내는 중..." : "보내기"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과. `Select`의 `items` prop 타입이 안 맞으면 `account-input-sheet.tsx` 사용례와 대조해 조정.

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/(app)/me/feedback/page.tsx" "apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx"
git commit -m "feat(me): /me/feedback 건의 폼 — 카테고리·본문·사진 첨부·성공 상태"
```

---

### Task 8: `/me` 진입 링크

**Files:**
- Create: `apps/web/src/app/(app)/me/_components/feedback-link.tsx`
- Modify: `apps/web/src/app/(app)/me/page.tsx` (import + `<LegalLinks />` 위에 1줄)

- [ ] **Step 1: feedback-link.tsx 작성**

`legal-links.tsx`와 동일한 카드 행 스타일(별도 카드 — 약관 그룹과 의미가 달라 분리):

```tsx
// apps/web/src/app/(app)/me/_components/feedback-link.tsx
// 개발자에게 건의하기 진입점 — legal-links 와 동일한 행 스타일.

import Link from "next/link";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { Card } from "@/components/ui/card";

export function FeedbackLink() {
  return (
    <Card padding="none" className="overflow-hidden">
      <Link
        href="/me/feedback"
        className="hover:bg-muted/60 active:bg-muted focus-visible:bg-muted flex items-center gap-3 px-4 py-3.5 focus-visible:outline-none"
      >
        <MessageSquarePlus className="text-muted-foreground size-4" aria-hidden="true" />
        <span className="t-body flex-1">개발자에게 건의하기</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}
```

- [ ] **Step 2: me/page.tsx에 배치**

import 추가 후 JSX의 `<LegalLinks />` 바로 위에 삽입:

```tsx
import { FeedbackLink } from "./_components/feedback-link";
// ... 기존 JSX
      <FeedbackLink />
      <LegalLinks />
```

- [ ] **Step 3: 타입 확인**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/(app)/me/_components/feedback-link.tsx" "apps/web/src/app/(app)/me/page.tsx"
git commit -m "feat(me): 마이페이지에 개발자에게 건의하기 진입 링크 추가"
```

---

### Task 9: 전체 검증

- [ ] **Step 1: 전체 게이트 실행**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

Expected: 전부 PASS. 실패 시 해당 Task로 돌아가 수정 후 재실행.

- [ ] **Step 2: 빌드 확인** (Server Action·신규 route 추가이므로)

Run: `pnpm build`
Expected: 빌드 성공, `/me/feedback` route 출력 확인

- [ ] **Step 3: 모바일 viewport 수동 검증 (spec §Verification 시나리오)**

`pnpm dev` 후 DevTools 모바일 viewport에서:
- `/me` → "개발자에게 건의하기" 행 → `/me/feedback` 이동
- 본문 없이 보내기 버튼 비활성 확인
- 카테고리+본문 제출 → 성공 상태("전달됐어요") → Supabase Studio에서 feedback row 확인
- 사진 첨부(미리보기·제거 버튼) → 제출 → Storage `feedback-photos`에 객체 + row의 `photo_path` 확인
- `.env.local`에 `SLACK_FEEDBACK_WEBHOOK_URL` 설정 시 #qa 메시지 도착 + 사진 링크 열람 확인 (미설정이면 제출만 확인하고 skip 사유 보고)
- RLS 실측: SQL Editor에서 `set role anon; insert into feedback ...` 거부 확인, authenticated로 타인 user_id insert 거부 확인

- [ ] **Step 4: 최종 커밋 (수정분 있으면)**

```bash
git add -A && git commit -m "fix(feedback): 검증 중 발견 수정"
```

---

## Self-Review 체크 결과

- **Spec coverage**: C1→Task 2 · C2→Task 2,4 · C3→Task 1 · C4→Task 6 · C5→Task 5,6 · C6→Task 7,8 · env→Task 3 · ADR/BE_SCHEMA→Task 3 · Verification→Task 9. 갭 없음.
- **타입 일관성**: `FeedbackCategory`/`FeedbackInput`(Task 1) ← Task 5,6,7에서 동일 명칭 사용. `uploadFeedbackPhoto` 시그니처(Task 4) ← Task 6 호출과 일치. `UploadFeedbackPhotoResult`의 `{ ok, path | reason }` ← Task 6 분기와 일치.
- **주의점**: Task 7의 base-ui `Select` `items` prop은 실제 컴파일 시 제네릭 추론이 까다로울 수 있음 — Step 3에서 `account-input-sheet.tsx`(검증된 사용례)와 대조하라고 명시함.
