// @vitest-environment node
// ADR-0024 — hydrate 단계 4개 read 가 adminClient + public 'use cache' 로 전환됐는지,
// viewer-agnostic read 는 cacheTag/key 에 viewerId 가 없고, viewer-specific read(kudos-viewer)는
// cacheTag + .eq('user_id', viewerId) SQL filter 에 viewerId 가 남는지 검증한다.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  eqCalls: [] as Array<[string, unknown]>,
  createSignedUrlCalls: [] as Array<[string, number]>,
  state: {
    actionLogRow: null as Record<string, unknown> | null,
    kudosRows: [] as Array<{ emoji: string }>,
    signedUrl: null as string | null,
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

// ADR-0024: hydrate read 는 user createClient 를 더 이상 호출하지 않는다. 회귀 가드.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("createClient must not be called from hydrate reads (ADR-0024)");
  }),
}));

// adminClient mock — chainable query builder + storage.
vi.mock("@/lib/supabase/admin", () => {
  function builder(resolve: { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => {
      h.eqCalls.push([col, val]);
      return b;
    };
    b.order = () => b;
    b.maybeSingle = async () => resolve;
    (b as { then: (cb: (v: unknown) => unknown) => Promise<unknown> }).then = (cb) =>
      Promise.resolve(resolve).then(cb);
    return b;
  }
  const adminMock = {
    from: (table: string) => {
      if (table === "action_logs") return builder({ data: h.state.actionLogRow, error: null });
      if (table === "kudos") return builder({ data: h.state.kudosRows, error: null });
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, ttl: number) => {
          h.createSignedUrlCalls.push([path, ttl]);
          return {
            data: h.state.signedUrl ? { signedUrl: h.state.signedUrl } : null,
            error: h.state.signedUrl ? null : { message: "fail" },
          };
        },
      }),
    },
  };
  return { adminClient: () => adminMock };
});

import { getActionLogPhotoSignedUrl } from "./photo-signed-url";
import { getActionLogHydrate } from "./action-log-hydrate";
import { getKudosCountsForLog } from "./kudos-counts";
import { getViewerKudosForLog } from "./kudos-viewer";
import { createClient } from "@/lib/supabase/server";

function tagArgs(cacheTag: unknown): string[] {
  return vi
    .mocked(cacheTag as (...args: string[]) => void)
    .mock.calls.flat()
    .map(String);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.eqCalls.length = 0;
  h.createSignedUrlCalls.length = 0;
  h.state.actionLogRow = null;
  h.state.kudosRows = [];
  h.state.signedUrl = null;
});

describe("ADR-0024 hydrate reads — admin + public cache", () => {
  it("photo-signed-url: viewer-agnostic cacheTag(photo-${path}) + adminClient, no createClient", async () => {
    const { cacheTag } = await import("next/cache");
    h.state.signedUrl = "https://signed.example/abc";
    const path = "user-a/ch-1/log-1-nonce.jpg";

    const url = await getActionLogPhotoSignedUrl(path, "viewer-1");

    expect(url).toBe("https://signed.example/abc");
    expect(cacheTag).toHaveBeenCalledWith(`photo-${path}`);
    expect(tagArgs(cacheTag).some((t) => t.includes("viewer-1"))).toBe(false);
    expect(h.createSignedUrlCalls).toEqual([[path, 600]]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("action-log-hydrate: viewer-agnostic cacheTag(actionlog-${id}), no viewerId in cache key", async () => {
    const { cacheTag } = await import("next/cache");
    h.state.actionLogRow = {
      id: "log-1",
      user_id: "author-1",
      photo_path: null,
      ai_summary: "오늘도 해냈다.",
      selected_keywords: ["펌핑"],
      created_at: "2026-05-28T00:00:00Z",
      users: { display_name: "철수" },
    };

    const res = await getActionLogHydrate("log-1", "viewer-1");

    expect(res).toMatchObject({ id: "log-1", authorId: "author-1", authorName: "철수" });
    expect(cacheTag).toHaveBeenCalledWith("actionlog-log-1");
    expect(tagArgs(cacheTag).some((t) => t.includes("viewer-1"))).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("kudos-counts: viewer-agnostic cacheTag(kudos-counts-${id}) + emoji aggregation", async () => {
    const { cacheTag } = await import("next/cache");
    h.state.kudosRows = [{ emoji: "🔥" }, { emoji: "🔥" }, { emoji: "💪" }];

    const counts = await getKudosCountsForLog("log-1");

    expect(counts).toEqual({ "🔥": 2, "💪": 1, "👏": 0 });
    expect(cacheTag).toHaveBeenCalledWith("kudos-counts-log-1");
    expect(tagArgs(cacheTag).some((t) => t.includes("viewer"))).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("kudos-viewer: viewer-specific cacheTag(user-${viewer}-kudos-${id}) + .eq('user_id', viewer) filter", async () => {
    const { cacheTag } = await import("next/cache");
    h.state.kudosRows = [{ emoji: "🔥" }];

    const emojis = await getViewerKudosForLog("log-1", "viewer-1");

    expect(emojis).toEqual(["🔥"]);
    expect(cacheTag).toHaveBeenCalledWith("user-viewer-1-kudos-log-1");
    // admin 이 RLS 를 우회하므로 user_id SQL filter 가 leak 의 유일한 방어선.
    expect(h.eqCalls).toContainEqual(["user_id", "viewer-1"]);
    expect(h.eqCalls).toContainEqual(["action_log_id", "log-1"]);
    expect(createClient).not.toHaveBeenCalled();
  });
});
