// @vitest-environment node
// EVAL-0016 보존 eval (02 §5.2 — read 계약 결정론 스냅샷, pass^k=100%).
// evals/fixtures/read-contracts/* 의 동일 rows·NOW 로 web read 결과가 EXPECTED 와
// 일치하는지 검증한다. RN read service 는 같은 fixture 를 apps/mobile jest 에서 검증
// (apps/mobile/src/features/*/api/*-reads.spec.ts) — 양쪽이 같은 EXPECTED 를 보므로
// web↔RN view-model parity 가 결정론으로 보장된다.
import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedResponseSchema } from "@withkey/domain";
import {
  HOME_NOW,
  HOME_TABLES,
  HOME_VIEWER,
  HOME_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/home";
import {
  DETAIL_NOW,
  DETAIL_TABLES,
  DETAIL_CHALLENGE_ID,
  DETAIL_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/challenge-detail";
import {
  RECAP_NOW,
  RECAP_TABLES,
  RECAP_VIEWER,
  RECAP_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/recap";
import {
  ME_TABLES,
  ME_VIEWER,
  ME_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/me";
import {
  GROUP_ID,
  GROUP_TABLES,
  GROUP_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/group";
import { FEED_RESPONSE } from "../../../../../../evals/fixtures/read-contracts/feed";
import { fetchCurrentChallenges } from "./current-challenges";
import { fetchChallengeDetail } from "./challenge-detail";
import { fetchRecap } from "./recap";
import { fetchMyChallenges } from "./my-challenges";
import { fetchGroupDetail } from "./group-detail";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

// fetchGroupDetail 은 getAuthedUser 로 viewer 를 키잉 — 보존 비교엔 viewer id 만 필요.
vi.mock("@/lib/supabase/auth", () => ({
  getAuthedUser: vi.fn(async () => ({ user: { id: "u1", email: null } })),
}));

// 테이블별 rows 를 돌려주는 chainable thenable mock (current-challenges.spec.ts 패턴).
type Row = Record<string, unknown>;
let currentTables: Record<string, Row[]> = {};

function makeBuilder(rows: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "is", "in", "eq", "or", "not", "gt", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: Row[]; error: null; count: number }) => unknown) =>
    resolve({ data: rows, error: null, count: rows.length });
  return builder;
}

function makeClient() {
  return { from: (table: string) => makeBuilder(currentTables[table] ?? []) };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeClient()),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("read 계약 보존 스냅샷 — web read == fixture EXPECTED", () => {
  it("home: fetchCurrentChallenges == HOME_EXPECTED", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HOME_NOW));
    currentTables = HOME_TABLES as Record<string, Row[]>;

    const views = await fetchCurrentChallenges(HOME_VIEWER);
    expect(views).toEqual(HOME_EXPECTED);
  });

  it("challenge: fetchChallengeDetail (doneByWeek strip) == DETAIL_EXPECTED", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DETAIL_NOW));
    currentTables = DETAIL_TABLES as Record<string, Row[]>;

    const view = await fetchChallengeDetail(DETAIL_CHALLENGE_ID);
    expect(view).not.toBeNull();
    // doneByWeek 는 서버 전용(Map — RN 계약 제외, ADR-0037) — 계약 필드만 비교.
    const contractView = {
      ...view!,
      members: view!.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        doneCount: m.doneCount,
        signed: m.signed,
      })),
    };
    expect(contractView).toEqual(DETAIL_EXPECTED);
  });

  it("recap: fetchRecap == RECAP_EXPECTED", async () => {
    currentTables = RECAP_TABLES as Record<string, Row[]>;
    const view = await fetchRecap(RECAP_VIEWER, {
      client: makeClient() as unknown as SupabaseClient,
      now: new Date(RECAP_NOW),
    });
    expect(view).toEqual(RECAP_EXPECTED);
  });

  it("group: fetchGroupDetail == GROUP_EXPECTED", async () => {
    currentTables = GROUP_TABLES as Record<string, Row[]>;
    const view = await fetchGroupDetail(GROUP_ID);
    expect(view).toEqual(GROUP_EXPECTED);
  });

  it("me: fetchMyChallenges == ME_EXPECTED", async () => {
    currentTables = ME_TABLES as Record<string, Row[]>;
    const my = await fetchMyChallenges(ME_VIEWER);
    expect(my).toEqual(ME_EXPECTED);
  });

  it("feed: BFF 응답 fixture 가 feedResponseSchema 계약을 통과한다", () => {
    const parsed = feedResponseSchema.parse(FEED_RESPONSE);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].kudosByEmoji["🔥"]).toBe(2);
  });
});
