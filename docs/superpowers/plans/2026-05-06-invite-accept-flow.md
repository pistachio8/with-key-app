# 친구 초대 링크 · 수락 플로우 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD §3 (기능 #1 그룹 서약서) AC-2/AC-3/AC-4 미구현분을 한 덩어리로 완성한다. 그룹장은 초대 링크를 생성·공유하고, 초대받은 친구는 로그인 → 그룹 참여 → **서약서 서명 화면으로 자동 진입**할 수 있다.

**PRD §3.2 원본 유저 플로우 (이 플랜이 구현하는 경로)**

```
[그룹장]                               [친구]
  ├─ 그룹 생성 + 챌린지 조건 입력         │
  ├─ 초대 링크 생성 ─────────────────▶  링크 클릭
  │                                     ├─ (미로그인) /login?next=/invite/<tok>
  │                                     ├─ 로그인 후 자동으로 /invite/<tok> 복귀
  │                                     ├─ 초대 프리뷰 (그룹명 + 서약서 1줄 요약)
  │                                     ├─ [참여하기] 탭 → accept_invite RPC
  │                                     │    (group_members + participants 편입)
  │                                     └─ **/pledge 로 리다이렉트** → 서약서 서명
  ◀──── 전원 서명 완료 ──────────────────┤
  ├─ `active` 전이
  └─ 챌린지 시작!
```

**Architecture:**

- **DB**: `invites` 테이블(`0001_init.sql:44-51`)과 RLS(`invites_select_owner/insert_owner/delete_owner`, `0002_rls.sql:72-87`)는 이미 배포됨. `group_members` INSERT 가 `service_role` 전용이라는 제약 때문에 수락 경로는 새 **SECURITY DEFINER RPC `accept_invite(p_token text)`** 로 구현한다. 이 RPC 가 `invites` 검증 → `group_members` upsert → 현재 `pending` 챌린지의 `challenge_participants` 보강(없으면 스킵)을 한 트랜잭션에서 수행하고, 성공 시 `group_id` 를 반환한다.
- **App**:
  - `/invite/[token]` 페이지는 이미 placeholder 로 존재(`src/app/(auth)/invite/[token]/page.tsx`). 로그인 상태 분기 + **서약서 1줄 요약 프리뷰** + "참여하기" 버튼 + 만료/꽉참 안내로 교체.
  - 로그아웃 상태에서는 `/login?next=/invite/[token]` 으로 리다이렉트 (매직링크 callback 의 `next` 파라미터를 이미 지원 — `src/app/auth/callback/route.ts:5`).
  - 수락 성공 시 **기존 `/pledge` 페이지로 리다이렉트**. `/pledge` 는 `fetchPendingPledge(userId)` 로 해당 유저의 pending 서약서를 자동 탐색하므로(`src/lib/db/reads/pledge.ts:13-23`), 쿼리 파라미터 불필요. pending 챌린지가 없는 그룹(오너가 아직 조건 입력 전) 에 합류한 경우엔 `/pledge` 가 "서명할 서약서 없음" empty state 를 보여주고 사용자는 홈으로 돌아갈 수 있다 — 별도 분기 불필요.
  - 그룹 상세(`/challenge/[id]`)에 "초대 링크 공유" 진입점을 달아 그룹장이 `createInvite` → clipboard 복사 + (가능 시) Web Share 를 띄운다.
- **Analytics**: `invite_sent` / `invite_opened` / `user_signed_up` 이벤트는 스키마에 이미 정의됨(`src/lib/analytics/schema.ts:24-28`, `:7-10`). 본 plan 은 발사 경로만 추가.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), Supabase Postgres + RLS, Zod, shadcn/ui, Sonner toast, Vitest (unit/integration), Playwright (E2E).

---

## Scope Check

이 플랜은 "초대 링크 발급 → 공유 → 수락 → 서약서 진입" 단일 서브시스템만 다룬다. 아래는 **Non-Goals** — 별도 plan 으로 분리:

- **멤버 제거 / 그룹장 권한 양도** — PRD §14 Out of Scope.
- **자동 챌린지 참가자 생성** — 챌린지가 `pending` 상태일 때 수락한 멤버를 `challenge_participants` 로 자동 편입하는 것까지는 본 plan 범위. `active` 이후의 freeze(AC-6) 로 인한 거부는 구현하되, 기존 `pending` 챌린지가 없으면 조용히 스킵(멤버십만 성립).
- **서약 서명 로직 재구현** — 기존 `/pledge` 페이지와 `signPledge` Server Action 을 그대로 재사용. 본 플랜은 accept 성공 → `/pledge` 로 네비게이션만 붙인다.
- **소셜 공유(카카오 공유 SDK)** — 본 plan 은 `navigator.share` 사용 가능 시 시도, 아니면 clipboard 복사 fallback 만.
- **토큰 일회성(소비 후 삭제/차단)** — PRD §3.4 "같은 사용자가 2번 초대 수락: idempotent" 규정에 따라 **중복 수락은 허용**(기존 멤버면 no-op). 토큰 자체는 재사용 가능(72h 만료만 강제).
- **거절/dismiss 버튼** — AcceptForm 은 1버튼 UI. "다음에 할래요" 는 뒤로가기로 처리 (PRD §3.4 의 "서명 거부" edge 는 v1).

---

## File Structure

| 파일 | 책임 | 종류 |
| ---- | ---- | ---- |
| `supabase/migrations/0018_accept_invite_rpc.sql` | `accept_invite(p_token text) returns uuid` RPC + 권한 | Create |
| `tests/integration/migrations/accept-invite.spec.ts` | RPC 검증 (만료 · 4명 초과 · idempotent · pending 챌린지 편입 · 비회원 토큰 수락) | Create |
| `src/types/supabase.ts` | `pnpm supabase gen types` 재생성 (Functions 에 `accept_invite` 추가) | Modify |
| `src/lib/invite/token.ts` | 서버 전용 `generateInviteToken(): string` (32B base64url) | Create |
| `src/lib/invite/token.spec.ts` | 길이 · charset · 충돌 가능성 | Create |
| `src/lib/invite/share-url.ts` | `buildInviteUrl(origin, token): string` (SSR-safe, origin 인자) | Create |
| `src/lib/invite/share-url.spec.ts` | URL 포맷 · 특수문자 토큰 인코딩 | Create |
| `src/lib/db/reads/invite.ts` | `fetchInvitePreview(token): { groupName, expiresAt, full, expired, pendingChallenge } \| null` — 미로그인 안전 | Create |
| `tests/integration/reads/invite.spec.ts` | 만료 · 꽉참 · 존재 X · 정상 · pending 챌린지 요약 포함 | Create |
| `src/app/(app)/group/[id]/_actions.ts` | `createInvite(groupId)` Server Action · RLS owner-only · `invite_sent` | Create |
| `src/app/(app)/group/[id]/_actions.spec.ts` | 오너만 허용 · 토큰 유일 · analytics 발사 | Create |
| `src/app/(app)/group/[id]/_components/invite-trigger.tsx` | 클라이언트 컴포넌트 · Web Share + clipboard fallback + toast | Create |
| `src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx` | createInvite 성공/실패 분기 · clipboard 호출 | Create |
| `src/app/(app)/challenge/[id]/page.tsx` | 그룹 오너에게 `<InviteTrigger />` 노출 | Modify |
| `src/app/(auth)/invite/[token]/page.tsx` | placeholder 제거 → 프리뷰 + 상태별 CTA | Modify |
| `src/app/(auth)/invite/[token]/_actions.ts` | `acceptInvite(token)` Server Action · RPC 호출 · `invite_opened` · `user_signed_up` | Create |
| `src/app/(auth)/invite/[token]/_actions.spec.ts` | unauthorized → redirect 힌트 · RPC 에러 매핑 | Create |
| `src/app/(auth)/invite/[token]/_components/accept-form.tsx` | 클라 폼 · 로그인된 유저용 "참여하기" 버튼 | Create |
| `src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx` | 성공 → router.push · 에러 → toast | Create |
| `tests/e2e/invite-accept.spec.ts` | Playwright: 오너 → 초대 링크 생성 → 다른 유저로 수락 → `/home` 에서 그룹 확인 | Create |
| `docs/TEAM_SHARE_DECISIONS.md` | **D-021 (신규)**: 초대 수락 SECURITY DEFINER RPC 경로 선택 근거 (group_members RLS deny 대응) | Modify |
| `docs/PRD.md` | §17 Changelog v0.4 — 초대 플로우 구현 완료 표기 | Modify |

---

## Task 1: DB 마이그레이션 — `accept_invite` RPC

**Files:**
- Create: `supabase/migrations/0018_accept_invite_rpc.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 0018_accept_invite_rpc.sql
--
-- 목적 (PRD §3.3 AC-3/AC-4 · BE_SCHEMA §8.3):
--   초대 토큰으로 로그인된 유저를 그룹에 편입한다.
--   group_members INSERT 가 RLS 상 service_role-only (0002_rls.sql 기준) 이므로
--   SECURITY DEFINER RPC 로 토큰 검증 + 멤버 편입 + pending 챌린지 참가자 편입을
--   단일 트랜잭션으로 수행한다.
--
--   반환: 참여한 group_id (uuid).
--   실패 SQLSTATE:
--     42501  auth 필요 / 4명 초과 (forbidden)
--     22023  토큰 형식 오류 (invalid_input)
--     P0002  토큰이 존재하지 않거나 만료됨 (NOT FOUND → not_found)
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_invite record;
  v_member_count int;
  v_already_member boolean;
  v_pending_challenge_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if p_token is null or char_length(p_token) < 1 then
    raise exception 'invalid invite token' using errcode = '22023';
  end if;

  select id, group_id, expires_at
    into v_invite
    from public.invites
    where token = p_token;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;

  select exists(
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) into v_already_member;

  if not v_already_member then
    select count(*) into v_member_count
      from public.group_members
      where group_id = v_invite.group_id;

    -- PRD §3.3 AC-4: 그룹 멤버 3~4명. 5명째 차단.
    if v_member_count >= 4 then
      raise exception 'group full' using errcode = '42501';
    end if;

    insert into public.group_members (group_id, user_id, role)
      values (v_invite.group_id, v_uid, 'member');

    -- pending 챌린지가 있으면 참가자로 편입 (active 이후는 freeze — PRD AC-6).
    select id into v_pending_challenge_id
      from public.challenges
      where group_id = v_invite.group_id
        and status = 'pending'
      order by created_at desc
      limit 1;

    if v_pending_challenge_id is not null then
      insert into public.challenge_participants (challenge_id, user_id)
        values (v_pending_challenge_id, v_uid)
        on conflict (challenge_id, user_id) do nothing;
    end if;
  end if;

  return v_invite.group_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated, service_role;
```

- [ ] **Step 2: 로컬 DB 에 적용**

Run: `pnpm db:push`
Expected: `Applying migration 0018_accept_invite_rpc.sql...` 에러 없이 종료.

- [ ] **Step 3: 타입 재생성**

Run: `pnpm supabase gen types typescript --local > src/types/supabase.ts`
Expected: `accept_invite` 가 `Database["public"]["Functions"]` 에 나타남.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0018_accept_invite_rpc.sql src/types/supabase.ts
git commit -m "feat(db): add accept_invite RPC for invite acceptance

PRD §3.3 AC-3/AC-4. group_members INSERT is service_role-only under RLS,
so acceptance goes through SECURITY DEFINER RPC that validates the token,
inserts group_members, and auto-joins any pending challenge."
```

---

## Task 2: RPC 통합 테스트

**Files:**
- Create: `tests/integration/migrations/accept-invite.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin, expectRlsDenied } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function createInviteRow(groupId: string, ownerId: string, opts: { expiresInMs?: number; token?: string } = {}) {
  const token = opts.token ?? `tok-${Math.random().toString(36).slice(2, 20)}`;
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 72 * 3600 * 1000)).toISOString();
  const { data, error } = await admin
    .from("invites")
    .insert({ group_id: groupId, token, expires_at: expiresAt, created_by: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; token: string };
}

describe("accept_invite RPC", () => {
  it("adds the caller as member and returns group_id", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { data, error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();
    expect(data).toBe(g.id);

    const { data: members } = await admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", g.id);
    expect(members?.find((m) => m.user_id === joiner.id)?.role).toBe("member");
  });

  it("is idempotent: existing member accepting again is no-op and returns group_id", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, joiner.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { data, error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();
    expect(data).toBe(g.id);

    const { count } = await admin
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", g.id)
      .eq("user_id", joiner.id);
    expect(count).toBe(1);
  });

  it("rejects expired token with not_found-ish error (P0002)", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const invite = await createInviteRow(g.id, owner.id, { expiresInMs: -1000 });

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error?.code).toBe("P0002");
  });

  it("rejects unknown token with P0002", async () => {
    const joiner = await createUser();
    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: "nonexistent-token" });
    expect(error?.code).toBe("P0002");
  });

  it("rejects when group already has 4 members (forbidden)", async () => {
    const owner = await createUser();
    const m1 = await createUser();
    const m2 = await createUser();
    const m3 = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, m1.id);
    await addMember(g.id, m2.id);
    await addMember(g.id, m3.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expectRlsDenied(error);
  });

  it("auto-joins pending challenge participants", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await admin
      .from("challenge_participants")
      .insert({ challenge_id: c.id, user_id: owner.id });
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();

    const { data: parts } = await admin
      .from("challenge_participants")
      .select("user_id, signed_at")
      .eq("challenge_id", c.id);
    const me = parts?.find((p) => p.user_id === joiner.id);
    expect(me).toBeDefined();
    expect(me?.signed_at).toBeNull();
  });

  it("does not join challenge that is already active (freeze)", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    // Create as pending then promote to active manually — active challenges
    // have no "pending" peer, so accept_invite must skip participant insert.
    const c = await createPendingChallenge(g.id);
    await admin
      .from("challenges")
      .update({
        status: "active",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .eq("id", c.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();

    const { data: parts } = await admin
      .from("challenge_participants")
      .select("user_id")
      .eq("challenge_id", c.id)
      .eq("user_id", joiner.id);
    expect(parts ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 (이 시점엔 Task 1 migration 이 이미 적용됐으므로 모두 통과해야 함)**

Run: `pnpm vitest run --project integration tests/integration/migrations/accept-invite.spec.ts`
Expected: 7 passed.

- [ ] **Step 3: 커밋**

```bash
git add tests/integration/migrations/accept-invite.spec.ts
git commit -m "test(db): cover accept_invite RPC paths

Token validity, idempotent re-accept, 4-member cap, pending vs active
challenge auto-join behaviour."
```

---

## Task 3: 토큰 생성 유틸 (`src/lib/invite/token.ts`)

**Files:**
- Create: `src/lib/invite/token.ts`
- Test: `src/lib/invite/token.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/invite/token.spec.ts
import { describe, it, expect } from "vitest";
import { generateInviteToken } from "./token";

describe("generateInviteToken", () => {
  it("returns a base64url string of fixed length (32B ⇒ 43 chars)", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → base64url without padding = 43 chars.
    expect(t.length).toBe(43);
  });

  it("produces unique values across 1k calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateInviteToken());
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit src/lib/invite/token.spec.ts`
Expected: FAIL — `Cannot find module './token'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/invite/token.ts
import "server-only";
import { randomBytes } from "node:crypto";

// PRD §3.3 AC-2: 72h 만료 토큰. 엔트로피는 32B(256bit) base64url.
// 충돌 가능성: 2^-128 per pair, invites.token UNIQUE 가 2차 방어.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit src/lib/invite/token.spec.ts`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/invite/token.ts src/lib/invite/token.spec.ts
git commit -m "feat(invite): add generateInviteToken (32B base64url)"
```

---

## Task 4: 공유 URL 빌더 (`src/lib/invite/share-url.ts`)

**Files:**
- Create: `src/lib/invite/share-url.ts`
- Test: `src/lib/invite/share-url.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/invite/share-url.spec.ts
import { describe, it, expect } from "vitest";
import { buildInviteUrl } from "./share-url";

describe("buildInviteUrl", () => {
  it("joins origin and token", () => {
    expect(buildInviteUrl("https://example.com", "abc123")).toBe(
      "https://example.com/invite/abc123",
    );
  });

  it("strips trailing slash on origin", () => {
    expect(buildInviteUrl("https://example.com/", "abc123")).toBe(
      "https://example.com/invite/abc123",
    );
  });

  it("encodes token characters that are unsafe in a URL path", () => {
    const weird = "a/b?c#d";
    expect(buildInviteUrl("https://example.com", weird)).toBe(
      `https://example.com/invite/${encodeURIComponent(weird)}`,
    );
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit src/lib/invite/share-url.spec.ts`
Expected: FAIL — `Cannot find module './share-url'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/invite/share-url.ts
// 서버/클라이언트 공용. Origin 은 호출자가 주입 (SSR 에서 headers()로, 클라에서 window.location.origin).
export function buildInviteUrl(origin: string, token: string): string {
  const trimmed = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${trimmed}/invite/${encodeURIComponent(token)}`;
}
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit src/lib/invite/share-url.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/invite/share-url.ts src/lib/invite/share-url.spec.ts
git commit -m "feat(invite): add buildInviteUrl helper"
```

---

## Task 5: 로그인 안전 프리뷰 리드 (`src/lib/db/reads/invite.ts`)

**Files:**
- Create: `src/lib/db/reads/invite.ts`
- Test: `tests/integration/reads/invite.spec.ts`

미로그인 유저가 `/invite/[token]` 을 열었을 때 "어느 그룹인지 / 만료됐는지 / 꽉 찼는지" 를 보여줘야 한다. 그런데 `invites` RLS(`invites_select_owner`)는 오너만 SELECT 가능 → **service_role 로 읽어야** 함. 본 리드는 `adminClient()` 사용.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

```ts
// tests/integration/reads/invite.spec.ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchInvitePreview } from "@/lib/db/reads/invite";

async function createInviteRow(groupId: string, ownerId: string, expiresInMs = 72 * 3600 * 1000) {
  const token = `tok-${Math.random().toString(36).slice(2, 20)}`;
  const expires = new Date(Date.now() + expiresInMs).toISOString();
  const { data, error } = await admin
    .from("invites")
    .insert({ group_id: groupId, token, expires_at: expires, created_by: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as { token: string };
}

describe("fetchInvitePreview", () => {
  it("returns groupName + not-expired + not-full + null challenge when no pending challenge", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id, { name: "민지네" });
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview).not.toBeNull();
    expect(preview!.groupName).toBe("민지네");
    expect(preview!.expired).toBe(false);
    expect(preview!.full).toBe(false);
    expect(preview!.pendingChallenge).toBeNull();
  });

  it("includes latest pending challenge summary when one exists", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id, { name: "민지네" });
    await createPendingChallenge(g.id, {
      title: "주 3회 헬스장",
      goalCount: 3,
      penaltyAmount: 3000,
      durationDays: 7,
    });
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.pendingChallenge).toEqual({
      title: "주 3회 헬스장",
      goalCount: 3,
      penaltyAmount: 3000,
      durationDays: 7,
    });
  });

  it("flags expired=true when expires_at in the past", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const inv = await createInviteRow(g.id, owner.id, -1000);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.expired).toBe(true);
  });

  it("flags full=true when group already has 4 members", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      await addMember(g.id, u.id);
    }
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.full).toBe(true);
  });

  it("returns null for unknown token", async () => {
    const preview = await fetchInvitePreview("does-not-exist");
    expect(preview).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project integration tests/integration/reads/invite.spec.ts`
Expected: FAIL — `Cannot find module '@/lib/db/reads/invite'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/db/reads/invite.ts
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type InvitePreview = {
  groupId: string;
  groupName: string | null;
  expiresAt: string;
  expired: boolean;
  full: boolean;
  // pending 챌린지가 있으면 1줄 요약을 같이 내려줌 — 친구가 참여 전에 조건 확인 가능.
  pendingChallenge: {
    title: string;
    goalCount: number;
    penaltyAmount: number;
    durationDays: number;
  } | null;
};

// invites RLS 는 오너 SELECT 전용 → service_role 로 최소 필드만 조회.
// 조회 자체가 민감 정보 유출이 되지 않도록 token 을 찾지 못하면 null 로 대체한다.
export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!token) return null;
  const client = adminClient();

  const { data: invite } = await client
    .from("invites")
    .select("group_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return null;

  const [{ data: group }, { count }, { data: challenge }] = await Promise.all([
    client.from("groups").select("id, name").eq("id", invite.group_id).maybeSingle(),
    client
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", invite.group_id),
    client
      .from("challenges")
      .select("title, goal_count, penalty_amount, duration_days")
      .eq("group_id", invite.group_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!group) return null;

  return {
    groupId: group.id,
    groupName: group.name,
    expiresAt: invite.expires_at,
    expired: new Date(invite.expires_at).getTime() <= Date.now(),
    full: (count ?? 0) >= 4,
    pendingChallenge: challenge
      ? {
          title: challenge.title,
          goalCount: challenge.goal_count,
          penaltyAmount: challenge.penalty_amount,
          durationDays: challenge.duration_days,
        }
      : null,
  };
}
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project integration tests/integration/reads/invite.spec.ts`
Expected: 5 passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/reads/invite.ts tests/integration/reads/invite.spec.ts
git commit -m "feat(invite): add fetchInvitePreview for /invite/[token] page

Admin client read bypasses invites_select_owner RLS so unauthenticated
visitors can see group name + expiry + full-capacity state before login."
```

---

## Task 6: `createInvite` Server Action

**Files:**
- Create: `src/app/(app)/group/[id]/_actions.ts`
- Test: `src/app/(app)/group/[id]/_actions.spec.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

```ts
// src/app/(app)/group/[id]/_actions.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const insert = vi.fn();
const singleSelect = vi.fn();
const fromMock = vi.fn(() => ({
  insert: (row: unknown) => {
    insert(row);
    return {
      select: () => ({
        single: singleSelect,
      }),
    };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
        error: null,
      }),
    },
    from: fromMock,
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

vi.mock("@/lib/invite/token", () => ({
  generateInviteToken: () => "FIXED_TOKEN_XYZ",
}));

import { createInvite } from "./_actions";

beforeEach(() => {
  insert.mockReset();
  singleSelect.mockReset();
  fromMock.mockClear();
  trackCalls.length = 0;
});

describe("createInvite", () => {
  it("rejects non-uuid groupId before touching Supabase", async () => {
    const res = await createInvite("not-a-uuid");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts invite row with generated token and tracks invite_sent", async () => {
    singleSelect.mockResolvedValueOnce({
      data: { token: "FIXED_TOKEN_XYZ" },
      error: null,
    });
    const groupId = "22222222-2222-4222-8222-222222222222";
    const res = await createInvite(groupId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.token).toBe("FIXED_TOKEN_XYZ");

    expect(fromMock).toHaveBeenCalledWith("invites");
    expect(insert).toHaveBeenCalledWith({
      group_id: groupId,
      token: "FIXED_TOKEN_XYZ",
      created_by: "11111111-1111-1111-1111-111111111111",
    });
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("invite_sent");
    expect(ev.props.groupId).toBe(groupId);
  });

  it("maps 42501 to forbidden (non-owner blocked by invites_insert_owner RLS)", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    const res = await createInvite("22222222-2222-4222-8222-222222222222");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps 23505 (unique collision on token) to conflict", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const res = await createInvite("22222222-2222-4222-8222-222222222222");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("conflict");
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit "src/app/(app)/group/[id]/_actions.spec.ts"`
Expected: FAIL — `Cannot find module './_actions'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/app/(app)/group/[id]/_actions.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { track } from "@/lib/analytics/track";
import { generateInviteToken } from "@/lib/invite/token";

const groupIdSchema = z.string().uuid();

// PRD §3.3 AC-2 · BE_SCHEMA §8.2.
// 72h 만료는 invites.expires_at DEFAULT 가 보장 (0001_init.sql:48).
// RLS invites_insert_owner 가 오너 외 호출을 42501 로 거부.
export const createInvite = withUser<string, { token: string }>(
  async (user, groupId): Promise<ActionResult<{ token: string }>> => {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return validationFailure(parsed.error);

    const token = generateInviteToken();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invites")
      .insert({
        group_id: parsed.data,
        token,
        created_by: user.id,
      })
      .select("token")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data?.token) return failure("upstream_error");

    void track(
      { name: "invite_sent", props: { groupId: parsed.data } },
      { userId: user.id },
    );

    return success({ token: data.token });
  },
);
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit "src/app/(app)/group/[id]/_actions.spec.ts"`
Expected: 4 passed.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/group/[id]/_actions.ts" "src/app/(app)/group/[id]/_actions.spec.ts"
git commit -m "feat(invite): add createInvite server action

PRD §3.3 AC-2. Owner-only via invites_insert_owner RLS; fires invite_sent."
```

---

## Task 7: 초대 링크 공유 트리거 UI

**Files:**
- Create: `src/app/(app)/group/[id]/_components/invite-trigger.tsx`
- Test: `src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx`

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

```tsx
// src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteTrigger } from "./invite-trigger";

const createInviteMock = vi.fn();
vi.mock("../_actions", () => ({
  createInvite: (groupId: string) => createInviteMock(groupId),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

const writeText = vi.fn();
beforeEach(() => {
  createInviteMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => writeText(t) },
  });
  // Force fallback-to-clipboard path: share is intentionally undefined.
});

afterEach(() => {
  vi.restoreAllMocks();
});

const GROUP_ID = "22222222-2222-4222-8222-222222222222";

describe("<InviteTrigger />", () => {
  it("copies invite URL on success and shows toast", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: true, data: { token: "ABC" } });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]![0]).toContain("/invite/ABC");
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("shows error toast on forbidden", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: false, error: "forbidden" });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit "src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx"`
Expected: FAIL — `Cannot find module './invite-trigger'`.

- [ ] **Step 3: 최소 구현**

```tsx
// src/app/(app)/group/[id]/_components/invite-trigger.tsx
"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildInviteUrl } from "@/lib/invite/share-url";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { createInvite } from "../_actions";

const userMessage = makeUserMessage({
  forbidden: "그룹장만 초대 링크를 만들 수 있어요.",
  conflict: "잠시 후 다시 시도해 주세요.",
});

type Props = {
  groupId: string;
};

// PRD §3.3 AC-2 · 화면 인벤토리 #2. Web Share API 가능 시 네이티브 시트,
// 아니면 clipboard 복사 후 토스트로 피드백.
export function InviteTrigger({ groupId }: Props) {
  const [pending, startTransition] = useTransition();
  const [, setLastUrl] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      try {
        const res = await createInvite(groupId);
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "";
        const url = buildInviteUrl(origin, res.data.token);
        setLastUrl(url);

        const shared = await tryWebShare(url);
        if (shared) return;

        await navigator.clipboard.writeText(url);
        toast.success("초대 링크를 복사했어요. 친구에게 보내주세요.");
      } catch (err) {
        console.error("[InviteTrigger] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Button
      size="lg"
      variant="outline"
      className="h-11 w-full gap-2"
      onClick={onClick}
      disabled={pending}
    >
      <Share2 aria-hidden="true" />
      {pending ? "링크 만드는 중..." : "친구 초대 링크 공유"}
    </Button>
  );
}

async function tryWebShare(url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  try {
    await navigator.share({
      title: "윗키 초대",
      text: "함께 운동 서약서를 써볼래?",
      url,
    });
    return true;
  } catch {
    // 사용자 취소 등은 복사 fallback 으로 넘어가지 않는다.
    return true;
  }
}
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit "src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx"`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/group/[id]/_components/invite-trigger.tsx" "src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx"
git commit -m "feat(invite): add InviteTrigger client component

Web Share API with clipboard fallback. Korean error copy via makeUserMessage."
```

---

## Task 8: 챌린지 상세 페이지에 InviteTrigger 노출 (오너 전용)

**Files:**
- Modify: `src/app/(app)/challenge/[id]/page.tsx`
- Modify: `src/lib/db/reads/challenge-detail.ts` (오너 여부를 표면화해야 한다면)

- [ ] **Step 1: `challenge-detail.ts` 확인**

Run: `grep -n "ownerId\|isOwner\|owner_id" src/lib/db/reads/challenge-detail.ts`
Expected: 현재 owner 식별자가 반환 타입에 포함되는지 확인. 없으면 추가.

- [ ] **Step 2: owner 식별자가 없으면 challenge-detail 에 `group.ownerId` 추가**

(실제 파일 읽고 group 서브오브젝트에 `ownerId: string` 추가. 이미 있다면 이 스텝은 skip.)

```ts
// 예: fetchChallengeDetail 반환에서
// group: { id, bankCode, accountHolder, accountNumberLast4, ownerId }
```

- [ ] **Step 3: 챌린지 상세 page 에 InviteTrigger 삽입**

현재 `page.tsx` 는 `detail.group.id` 를 이미 들고 있음. 사용자 id 와 `group.ownerId` 비교 후 오너만 렌더.

`src/app/(app)/challenge/[id]/page.tsx` 수정 — MemberStrip 섹션 위나 아래에 다음 블록 삽입:

```tsx
{user.id === detail.group.ownerId ? (
  <section aria-label="초대">
    <InviteTrigger groupId={detail.group.id} />
  </section>
) : null}
```

파일 상단에 import 추가:
```tsx
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
```

(경로 별칭은 프로젝트 `tsconfig.json` 의 `@/*` 매핑을 씀 — 기존 파일들과 동일한 스타일.)

- [ ] **Step 4: 타입체크 + 단위 테스트**

Run: `pnpm tsc --noEmit --pretty false && pnpm vitest run --project unit`
Expected: 에러 0, 기존 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/app/(app)/challenge/[id]/page.tsx src/lib/db/reads/challenge-detail.ts
git commit -m "feat(invite): surface InviteTrigger on challenge page for owner"
```

---

## Task 9: `acceptInvite` Server Action

**Files:**
- Create: `src/app/(auth)/invite/[token]/_actions.ts`
- Test: `src/app/(auth)/invite/[token]/_actions.spec.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

```ts
// src/app/(auth)/invite/[token]/_actions.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    rpc: (name: string, args: unknown) => rpc(name, args),
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

import { acceptInvite } from "./_actions";

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  trackCalls.length = 0;
});

describe("acceptInvite", () => {
  it("returns unauthorized when no session (no rpc call)", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects empty token", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
      error: null,
    });
    const res = await acceptInvite("");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("on success returns groupId and tracks invite_opened", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });

    const res = await acceptInvite("tok");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.groupId).toBe(groupId);

    expect(rpc).toHaveBeenCalledWith("accept_invite", { p_token: "tok" });
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("invite_opened");
    expect(ev.props.groupId).toBe(groupId);
  });

  it("maps 42501 to forbidden (group full or auth edge)", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "group full" },
    });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps P0002 (token missing/expired) to not_found", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0002", message: "expired" },
    });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit "src/app/(auth)/invite/[token]/_actions.spec.ts"`
Expected: FAIL — `Cannot find module './_actions'`.

- [ ] **Step 3: 최소 구현**

`mapSupabaseError` 가 `P0002` 를 기본 `upstream_error` 로 돌리므로, 이 액션은 RPC 경로에서만 P0002 → `not_found` 로 매핑한다. (전역 매퍼를 수정하지 않아 다른 코드에 영향 없음.)

```ts
// src/app/(auth)/invite/[token]/_actions.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/auth/with-user";
import {
  success,
  failure,
  validationFailure,
  type ActionResult,
  type ErrorCode,
} from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { track } from "@/lib/analytics/track";

const tokenSchema = z.string().min(1);

type PgErrorLike = { code?: string | null; message?: string | null };

function mapAcceptInviteError(err: PgErrorLike): ErrorCode {
  if (err.code === "P0002") return "not_found";
  return mapSupabaseError(err);
}

// PRD §3.3 AC-3 · BE_SCHEMA §8.3.
// RPC accept_invite 가 만료·중복·꽉참을 한 번에 판정. 이 Action 은 매핑만.
export const acceptInvite = withUser<string, { groupId: string }>(
  async (user, token): Promise<ActionResult<{ groupId: string }>> => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invite", { p_token: parsed.data });

    if (error) return failure(mapAcceptInviteError(error));
    if (!data || typeof data !== "string") return failure("upstream_error");

    void track(
      { name: "invite_opened", props: { groupId: data, fromOrganicUser: false } },
      { userId: user.id },
    );

    return success({ groupId: data });
  },
);
```

> `fromOrganicUser` 는 신규 가입 여부를 식별하는 플래그. POC 에서는 "세션이 이 링크로 처음 들어온 경우" 를 서버에서 엄밀히 판정하지 않고 **기본 false** 로 보낸다. 추후 referer/세션-연령으로 보강(§14 Out of Scope 에 준함).

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit "src/app/(auth)/invite/[token]/_actions.spec.ts"`
Expected: 5 passed.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(auth)/invite/[token]/_actions.ts" "src/app/(auth)/invite/[token]/_actions.spec.ts"
git commit -m "feat(invite): add acceptInvite server action

Wraps accept_invite RPC. P0002 → not_found mapping stays local to keep
mapSupabaseError neutral for other callers."
```

---

## Task 10: 초대 수락 폼 컴포넌트

**Files:**
- Create: `src/app/(auth)/invite/[token]/_components/accept-form.tsx`
- Test: `src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AcceptForm } from "./accept-form";

const acceptInviteMock = vi.fn();
vi.mock("../_actions", () => ({
  acceptInvite: (token: string) => acceptInviteMock(token),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (_: string) => {},
  },
}));

beforeEach(() => {
  acceptInviteMock.mockReset();
  pushMock.mockReset();
  toastError.mockReset();
});

describe("<AcceptForm />", () => {
  it("on success, pushes to /pledge so the user can sign the pledge", async () => {
    acceptInviteMock.mockResolvedValueOnce({
      ok: true,
      data: { groupId: "22222222-2222-4222-8222-222222222222" },
    });

    render(<AcceptForm token="TOK" groupName="민지네" />);
    fireEvent.click(screen.getByRole("button", { name: "참여하고 서명하러 가기" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/pledge"));
  });

  it("on not_found, shows expired-friendly error and does not navigate", async () => {
    acceptInviteMock.mockResolvedValueOnce({ ok: false, error: "not_found" });

    render(<AcceptForm token="TOK" groupName="민지네" />);
    fireEvent.click(screen.getByRole("button", { name: "참여하고 서명하러 가기" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]![0]).toMatch(/만료|다시|유효/);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행으로 실패 확인**

Run: `pnpm vitest run --project unit "src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: 최소 구현**

```tsx
// src/app/(auth)/invite/[token]/_components/accept-form.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { acceptInvite } from "../_actions";

const userMessage = makeUserMessage({
  not_found: "만료되었거나 유효하지 않은 초대 링크예요.",
  forbidden: "그룹 인원이 가득 찼어요 (최대 4명).",
  invalid_input: "잘못된 초대 링크예요.",
});

type Props = {
  token: string;
  groupName: string | null;
};

// PRD §3.2 원본 유저 플로우: 참여 → 서약서 확인 → 서명.
// 수락 성공 시 /pledge 로 보내 기존 서약 UI 를 재사용한다.
// pending 챌린지가 없으면 /pledge 가 "서명할 서약서 없음" empty state 를 보여준다.
export function AcceptForm({ token, groupName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const res = await acceptInvite(token);
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        router.push("/pledge");
      } catch (err) {
        console.error("[AcceptForm] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground break-keep text-sm">
        <span className="font-semibold">{groupName ?? "이름 없는 그룹"}</span> 에 참여하시겠어요?
        <br />
        참여하면 바로 서약서 서명 화면으로 이동해요.
      </p>
      <Button size="lg" className="h-12 w-full" onClick={onClick} disabled={pending}>
        {pending ? "참여 중..." : "참여하고 서명하러 가기"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 재실행**

Run: `pnpm vitest run --project unit "src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx"`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(auth)/invite/[token]/_components/accept-form.tsx" "src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx"
git commit -m "feat(invite): add AcceptForm client component"
```

---

## Task 11: `/invite/[token]` 페이지 재작성

**Files:**
- Modify: `src/app/(auth)/invite/[token]/page.tsx`

로그인 상태에 따라 분기한다:
- 미로그인 → `/login?next=/invite/[token]` 로 서버 리다이렉트 (callback 이 next 를 honor — `src/app/auth/callback/route.ts:5`).
- 로그인 + 토큰 무효 → "만료/꽉참" 안내 카드.
- 로그인 + 유효 → `<AcceptForm />`.

- [ ] **Step 1: 페이지 수정**

```tsx
// src/app/(auth)/invite/[token]/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchInvitePreview } from "@/lib/db/reads/invite";
import { AcceptForm } from "./_components/accept-form";

type Params = Promise<{ token: string }>;

// PRD §3.3 AC-2/AC-3/AC-4 · §3.4 만료/꽉참 edge cases.
export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/invite/${encodeURIComponent(token)}`);
    redirect(`/login?next=${next}`);
  }

  const preview = await fetchInvitePreview(token);

  if (!preview) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">유효하지 않은 초대</h1>
        <p className="text-muted-foreground break-keep text-sm">
          만료되었거나 존재하지 않는 초대 링크예요. 그룹장에게 새 링크를 요청해 주세요.
        </p>
      </InviteShell>
    );
  }

  if (preview.expired) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">만료된 초대</h1>
        <p className="text-muted-foreground break-keep text-sm">
          이 초대 링크는 72시간이 지나 만료됐어요. 그룹장에게 새 링크를 요청해 주세요.
        </p>
      </InviteShell>
    );
  }

  if (preview.full) {
    return (
      <InviteShell>
        <h1 className="text-xl font-semibold">그룹이 가득 찼어요</h1>
        <p className="text-muted-foreground break-keep text-sm">
          이 그룹은 이미 4명이 참여 중이에요 (최대 인원).
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <h1 className="text-xl font-semibold">그룹 초대</h1>
      {preview.pendingChallenge ? (
        <PledgeSummary challenge={preview.pendingChallenge} />
      ) : (
        <p className="text-muted-foreground break-keep text-xs">
          아직 진행 중인 서약서가 없어요. 참여하면 그룹장이 서약서를 만들 때 바로 알림을 받아요.
        </p>
      )}
      <AcceptForm token={token} groupName={preview.groupName} />
    </InviteShell>
  );
}

function PledgeSummary({
  challenge,
}: {
  challenge: {
    title: string;
    goalCount: number;
    penaltyAmount: number;
    durationDays: number;
  };
}) {
  return (
    <section
      aria-label="서약서 요약"
      className="bg-muted/40 flex flex-col gap-1 rounded-xl border p-4 text-sm"
    >
      <p className="font-semibold">📜 {challenge.title}</p>
      <p className="text-muted-foreground text-xs">
        {challenge.durationDays}일 · 주 {challenge.goalCount}회 · 벌금{" "}
        {challenge.penaltyAmount.toLocaleString("ko-KR")}원
      </p>
    </section>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-center gap-4 px-6 py-10">
      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">{children}</section>
    </main>
  );
}
```

- [ ] **Step 2: 타입체크 + 단위 테스트**

Run: `pnpm tsc --noEmit --pretty false && pnpm vitest run --project unit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(auth)/invite/[token]/page.tsx"
git commit -m "feat(invite): wire /invite/[token] to preview + accept flow

Unauthenticated → redirect to /login?next=/invite/<token> (auth callback
already honours ?next). Authenticated + valid → pledge summary + AcceptForm.
Invalid/expired/full → dedicated empty state."
```

---

## Task 12: E2E 테스트 — 오너가 초대 → 다른 유저가 수락

**Files:**
- Create: `tests/e2e/invite-accept.spec.ts`

기존 e2e 는 단일 세션 storageState 기반. 이 시나리오는 두 유저가 필요해 service-role 로 두 번째 유저를 만들고, 두 번째 `BrowserContext` 로 sign-in 한다.

- [ ] **Step 1: E2E 파일 작성**

```ts
// tests/e2e/invite-accept.spec.ts
import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test("owner creates invite, second user accepts and lands on /pledge", async ({
  page,
  groupId,
  browser,
}) => {
  // Owner view: navigate to their challenge page, click "친구 초대 링크 공유".
  // The trigger uses navigator.clipboard — read it back via page.evaluate.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  // Create a pending challenge under the seeded group so the invite flow has
  // a destination to wire participants into.
  const { data: challenge } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "e2e-invite",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    })
    .select("id")
    .single();
  if (!challenge) throw new Error("failed to seed challenge");

  await page.goto(`/challenge/${challenge.id}`);
  await page.getByRole("button", { name: "친구 초대 링크 공유" }).click();

  // Wait for toast, then read clipboard.
  await expect(page.getByText("초대 링크를 복사했어요")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/\/invite\//);

  // Second user: create via admin API, log in via dev-login, open invite URL.
  const joinerEmail = `joiner-${Date.now()}@test.local`;
  const { data: joinerData, error: joinerErr } = await admin.auth.admin.createUser({
    email: joinerEmail,
    email_confirm: true,
  });
  if (joinerErr || !joinerData?.user) throw new Error("failed to seed joiner user");
  const joinerId = joinerData.user.id;

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: joinerEmail,
  });
  if (linkErr) throw linkErr;
  const tokenHash = link.properties?.hashed_token;
  if (!tokenHash) throw new Error("no hashed_token from generateLink");

  const joinerContext = await browser.newContext();
  try {
    const joinerPage = await joinerContext.newPage();
    // Verify via dev-login so cookies are set by @supabase/ssr.
    const u = new URL(inviteUrl);
    const next = `${u.pathname}${u.search}`;
    await joinerPage.goto(
      `/auth/dev-login?token_hash=${tokenHash}&next=${encodeURIComponent(next)}`,
    );
    await expect(
      joinerPage.getByRole("button", { name: "참여하고 서명하러 가기" }),
    ).toBeVisible({ timeout: 15_000 });
    await joinerPage.getByRole("button", { name: "참여하고 서명하러 가기" }).click();

    // Joiner should land on /pledge and see the pending pledge for signing.
    await expect(joinerPage).toHaveURL(/\/pledge$/, { timeout: 10_000 });
    await expect(joinerPage.getByText("e2e-invite")).toBeVisible({ timeout: 10_000 });

    // Direct DB check: joiner is group_members row AND participant of pending challenge.
    const { count: memberCount } = await admin
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("user_id", joinerId);
    expect(memberCount).toBe(1);

    const { count: partCount } = await admin
      .from("challenge_participants")
      .select("*", { count: "exact", head: true })
      .eq("challenge_id", challenge.id)
      .eq("user_id", joinerId);
    expect(partCount).toBe(1);
  } finally {
    await joinerContext.close();
    // Cleanup: joiner user + any group_members rows cascade from fixture teardown.
    await admin.auth.admin.deleteUser(joinerId);
  }
});
```

- [ ] **Step 2: E2E 실행**

Run: `pnpm playwright test tests/e2e/invite-accept.spec.ts`
Expected: 1 passed.

> 실패 시 확인: `/auth/dev-login` 은 `NODE_ENV !== "production"` 에서만 활성. `.env.local` 에 `SUPABASE_SECRET_KEY` 가 있어야 admin 동작. clipboard 권한은 Playwright context 에 명시적으로 grant.

- [ ] **Step 3: 커밋**

```bash
git add tests/e2e/invite-accept.spec.ts
git commit -m "test(e2e): cover owner-create-invite → joiner-accept path"
```

---

## Task 13: DECISIONS · PRD Changelog 업데이트

**Files:**
- Modify: `docs/TEAM_SHARE_DECISIONS.md`
- Modify: `docs/PRD.md`

- [ ] **Step 1: DECISIONS — D-021 추가**

`docs/TEAM_SHARE_DECISIONS.md` 에 최신 D-NNN 번호 뒤에 다음 엔트리 삽입 (파일 상단의 "최신이 위" 규칙을 따라 맨 위 D 블록 바로 앞):

```markdown
### D-021 · 초대 수락을 SECURITY DEFINER RPC 로 구현 (2026-05-06)

- **결정**: 초대 수락 경로를 `accept_invite(p_token text) returns uuid` RPC 로 구현.
- **왜**: `group_members` INSERT 는 0002_rls.sql 기준 `service_role` 전용. 사용자 토큰으로 직접 insert 불가. 대안 A (앱 서버 Action 에서 `adminClient` 로 insert) 는 RLS 우회면 확대. 대안 B (group_members INSERT RLS 정책 추가) 는 멤버십-자기증명 loop 위험 (A 가 B 를 초대하는 걸 막을 수 없음). RPC 경로는 토큰 검증과 insert 를 한 트랜잭션에 묶어 최소 노출면 보장.
- **적용 범위**: `supabase/migrations/0018_accept_invite_rpc.sql`, `src/app/(auth)/invite/[token]/_actions.ts`.
- **되돌릴 조건**: 초대 외에 "자발적 그룹 탐색 가입" 기능이 생기면 RPC 1개로는 부족 — 그때 RLS 정책 재설계.
```

- [ ] **Step 2: PRD Changelog 업데이트**

`docs/PRD.md` §17 상단에 다음 엔트리 삽입:

```markdown
- **v0.4** (2026-05-06) — **친구 초대 · 수락 플로우 구현** (Ian · D-021)
  - §3 기능 #1: AC-2/AC-3/AC-4 구현분 착지. `createInvite` / `acceptInvite` Server Action + `accept_invite` RPC.
  - §9 이벤트: `invite_sent` · `invite_opened` 실제 발사 경로 연결.
  - §10 화면 #2: 챌린지 상세에서 공유 버튼 노출.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/TEAM_SHARE_DECISIONS.md docs/PRD.md
git commit -m "docs: record D-021 (invite accept via SECURITY DEFINER RPC)

PRD v0.4 changelog entry for invite/accept implementation."
```

---

## Task 14: 최종 검증

- [ ] **Step 1: 전체 빌드**

Run: `pnpm build`
Expected: success.

- [ ] **Step 2: 전체 테스트**

Run: `pnpm vitest run && pnpm playwright test tests/e2e/invite-accept.spec.ts tests/e2e/auth-login.spec.ts`
Expected: 모두 pass.

- [ ] **Step 3: 수동 QA 체크리스트**

- [ ] 오너가 `/challenge/[id]` 에서 공유 버튼 노출 · 비오너는 숨김
- [ ] 링크 복사 후 다른 브라우저에서 붙여넣어 `/login?next=...` 로 유도됨
- [ ] 로그인 후 자동으로 `/invite/[token]` 으로 복귀 · 서약서 요약(제목·횟수·벌금) + "참여하고 서명하러 가기" 노출
- [ ] 만료 링크(expires_at 과거) 를 열면 "만료된 초대" 안내
- [ ] 이미 4명 그룹에 5번째가 링크 열면 "가득 찼어요" 안내
- [ ] 수락 버튼 탭 → `/pledge` 로 자동 이동 · 서약서 서명 UI 노출
- [ ] 서명 후 `/home` 그룹 스트립에 신규 그룹 나타남
- [ ] pending 챌린지 없는 그룹(오너가 조건 미입력)에 합류 시 `/pledge` 가 "서명할 서약서 없음" 상태로 안전 착지

- [ ] **Step 4: PR 생성**

Run: `gh pr create --title "feat: 친구 초대 링크 · 수락 플로우 (PRD §3 AC-2/3/4)"`
PR body (한국어 — `.claude/rules/common/git-workflow.md` §PR 본문 언어):

```
## Summary
- `accept_invite` SECURITY DEFINER RPC 신설 (0018 migration). group_members INSERT RLS deny 를 우회하면서도 토큰 검증·4명 상한·pending 챌린지 참가자 편입을 한 트랜잭션에 묶어 노출면 최소화.
- `createInvite` / `acceptInvite` Server Action + 32B base64url 토큰 생성.
- `/invite/[token]` 페이지: 미로그인 → /login?next= redirect, 로그인 → 서약서 1줄 요약 프리뷰 + 만료/꽉참 분기 + "참여하고 서명하러 가기".
- **수락 성공 시 `/pledge` 로 이동** — 기존 서약 UI 재사용. PRD §3.2 원본 플로우(초대 → 참여 → 서약) 준수.
- 챌린지 상세에 오너 전용 "친구 초대 링크 공유" 버튼 추가 (Web Share + clipboard fallback).
- `invite_sent` / `invite_opened` analytics 발사 경로 연결.

## Test plan
- [x] integration: accept-invite RPC 7 시나리오 (만료·꽉참·idempotent·pending/active 편입)
- [x] integration: fetchInvitePreview 4 시나리오
- [x] unit: _actions / 컴포넌트 스펙 (각 2~5 케이스)
- [x] e2e: 오너 초대 → 2nd user 수락 → /home 진입 + DB 상태 확인

## Out of scope
- 카카오 공유 SDK 연동 (navigator.share fallback 만 구현)
- 토큰 일회성 · 초대 링크 revoke UI
- 멤버 추방 / 그룹장 양도
```

---

## Self-Review (after writing)

**1. Spec coverage (PRD §3 AC-2/3/4 + §3.2 원본 플로우 + §3.4 + §9 이벤트):**
- AC-2 (72h 토큰): Task 1 (DEFAULT 유지), Task 3 (토큰 생성), Task 6 (invite row insert). ✅
- AC-3 (로그인 후 참여): Task 9 (acceptInvite), Task 10 (AcceptForm), Task 11 (unauthenticated redirect → /login?next=). ✅
- AC-4 (3~4명 상한): Task 1 RPC `v_member_count >= 4` check + Task 2 테스트. ✅
- §3.2 "참여 → 서약서 확인 → 서명" 연쇄: Task 10 `/pledge` 네비게이션 + Task 11 챌린지 요약 프리뷰 + Task 12 E2E. ✅
- §3.4 edge: 만료 (Task 1/11), 중복 수락 idempotent (Task 1/2), 꽉참 (Task 1/11). ✅
- §9 이벤트: `invite_sent` (Task 6), `invite_opened` (Task 9). ✅

**2. Placeholder scan:** 완료. TBD/TODO 없음. 모든 code step 에 실제 코드 블록.

**3. Type consistency:**
- `createInvite(groupId: string): ActionResult<{ token: string }>` — Task 6/7 일관.
- `acceptInvite(token: string): ActionResult<{ groupId: string }>` — Task 9/10 일관.
- `fetchInvitePreview(token): InvitePreview | null` — Task 5/11 일관.
- RPC `accept_invite(p_token text) returns uuid` — Task 1/2/9 일관.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-invite-accept-flow.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
