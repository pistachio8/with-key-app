import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyConfig } from "./config";
import type { PhashMatch } from "./phash";
import type { VerifySignals } from "./signals";

// EVAL-0022 판정 테이블 테스트 — θ 는 픽스처로 주입한다(env·하드코딩 비의존).
// 매핑 SoT: false-flag-threshold-theta spec §판정 매핑 (1~5 + shadow + graceful).

// θ 픽스처 — spec 잠정값(6/10)과 동일하되 코드가 아닌 테스트 입력으로 주입.
const theta: VerifyConfig = { phashFailMax: 6, phashReviewMax: 10, enforce: false };
const thetaEnforced: VerifyConfig = { ...theta, enforce: true };

function match(distance: number, userId = "other", actionLogId = `log-${distance}`): PhashMatch {
  return { actionLogId, userId, distance };
}

const noMatches = { sameUser: [], sameGroup: [], global: [] };

// ── 순수 판정 매핑 ──────────────────────────────────────────────

import {
  judgeVerifyStatus,
  countsTowardDone,
  classifyPhashMatches,
  JUDGE_MODEL_VERSION,
} from "./judge";

describe("judgeVerifyStatus — θ 주입 판정 테이블", () => {
  it("청정(매치 없음) → passed (AC-auto-verify-1 기본 신뢰)", () => {
    expect(judgeVerifyStatus(noMatches, theta)).toEqual({
      status: "passed",
      reason: "clean",
      distance: null,
    });
  });

  it("동일-user 재탕 d ≤ failMax → failed (AC-cheat-detect-2)", () => {
    for (const d of [0, 3, 6]) {
      const decision = judgeVerifyStatus({ ...noMatches, sameUser: [match(d, "me")] }, theta);
      expect(decision.status).toBe("failed");
      expect(decision.reason).toBe("same_user_reuse");
      expect(decision.distance).toBe(d);
    }
  });

  it("동일-group cross-user d ≤ failMax → failed (AC-cheat-detect-2)", () => {
    for (const d of [0, 3, 6]) {
      const decision = judgeVerifyStatus({ ...noMatches, sameGroup: [match(d)] }, theta);
      expect(decision).toEqual({ status: "failed", reason: "same_group_reuse", distance: d });
    }
  });

  it("동일-user/group 경계 failMax < d ≤ reviewMax → manual_review (AC-auto-verify-3)", () => {
    for (const d of [7, 10]) {
      expect(judgeVerifyStatus({ ...noMatches, sameUser: [match(d, "me")] }, theta).status).toBe(
        "manual_review",
      );
      expect(judgeVerifyStatus({ ...noMatches, sameGroup: [match(d)] }, theta)).toEqual({
        status: "manual_review",
        reason: "near_duplicate",
        distance: d,
      });
    }
  });

  it("전역 cross-user d ≤ failMax → manual_review (auto-failed 금지, AC-cheat-detect-2)", () => {
    const decision = judgeVerifyStatus({ ...noMatches, global: [match(0)] }, theta);
    expect(decision).toEqual({ status: "manual_review", reason: "global_near_match", distance: 0 });
  });

  it("전역 cross-user 경계(failMax < d ≤ reviewMax) → passed (신호 기록만, spec §매핑 3·4)", () => {
    expect(judgeVerifyStatus({ ...noMatches, global: [match(7)] }, theta).status).toBe("passed");
  });

  it("reviewMax 초과 거리는 모든 scope 에서 passed", () => {
    const far = { sameUser: [match(11, "me")], sameGroup: [match(20)], global: [match(11)] };
    expect(judgeVerifyStatus(far, theta).status).toBe("passed");
  });

  it("여러 매치 중 최소 거리로 판정한다", () => {
    const decision = judgeVerifyStatus(
      { ...noMatches, sameUser: [match(20, "me"), match(4, "me"), match(9, "me")] },
      theta,
    );
    expect(decision).toEqual({ status: "failed", reason: "same_user_reuse", distance: 4 });
  });

  it("θ 외부 주입 — 더 좁은 θ(failMax=2) 픽스처에선 d=3 이 failed 가 아니다", () => {
    const narrow: VerifyConfig = { phashFailMax: 2, phashReviewMax: 4, enforce: false };
    const decision = judgeVerifyStatus({ ...noMatches, sameUser: [match(3, "me")] }, narrow);
    expect(decision.status).toBe("manual_review");
    expect(judgeVerifyStatus({ ...noMatches, sameUser: [match(2, "me")] }, narrow).status).toBe(
      "failed",
    );
  });
});

describe("countsTowardDone — shadow/enforce 해석", () => {
  it("passed·manual_review·pending 은 enforce 와 무관하게 doneCount 인정", () => {
    for (const config of [theta, thetaEnforced]) {
      expect(countsTowardDone("passed", config)).toBe(true);
      expect(countsTowardDone("manual_review", config)).toBe(true);
      expect(countsTowardDone("pending", config)).toBe(true);
    }
  });

  it("shadow(enforce=false): failed 도 would-be 기록일 뿐 카운트 인정(차단 0)", () => {
    expect(countsTowardDone("failed", theta)).toBe(true);
  });

  it("enforce=true 에서만 failed 가 카운트 제외", () => {
    expect(countsTowardDone("failed", thetaEnforced)).toBe(false);
  });

  it("peer_rejected 는 사람 결정이라 enforce 무관 제외", () => {
    expect(countsTowardDone("peer_rejected", theta)).toBe(false);
    expect(countsTowardDone("peer_rejected", thetaEnforced)).toBe(false);
  });
});

describe("classifyPhashMatches — scope 분류", () => {
  it("전역 결과의 본인 매치는 sameUser(다른 그룹 재탕 포함), 그룹 내 타인은 sameGroup, 나머지는 global", () => {
    const inGroup = match(5, "friend", "log-g");
    const mineOtherGroup = match(3, "me", "log-mine");
    const stranger = match(2, "stranger", "log-s");
    const scoped = classifyPhashMatches({
      userId: "me",
      groupMatches: [inGroup],
      globalMatches: [inGroup, mineOtherGroup, stranger],
    });
    expect(scoped.sameUser).toEqual([mineOtherGroup]);
    expect(scoped.sameGroup).toEqual([inGroup]);
    expect(scoped.global).toEqual([stranger]);
  });
});

// ── 오케스트레이션(write) — adminClient·중복 read mock ───────────

const updateArgs: Array<Record<string, unknown>> = [];
const eqCalls: Array<[string, unknown]> = [];
let updateError: unknown = null;

function updateChain() {
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  };
  chain.then = (onFulfilled: (r: { error: unknown }) => unknown) =>
    onFulfilled({ error: updateError });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: () => ({
      update: (vals: Record<string, unknown>) => {
        updateArgs.push(vals);
        return updateChain();
      },
    }),
  }),
}));

vi.mock("@/lib/db/reads/phash-duplicates", () => ({
  findActionLogPhashDuplicates: vi.fn(),
}));

import { findActionLogPhashDuplicates } from "@/lib/db/reads/phash-duplicates";
import { judgeAndRecordVerifyStatus } from "./judge";

const cleanSignals: VerifySignals = {
  phash: "0".repeat(16),
  capturedAt: null,
  exifPresent: false,
  cameraExifPresent: false,
  screenshot: { suspected: false, reasons: [] },
  captureToSubmitMs: null,
  modelVersion: "verify-signals-phash-dct64-v1",
};

function dupResult(matches: PhashMatch[]) {
  return {
    matches,
    nearest: matches[0] ?? null,
    exactDuplicate: matches.some((m) => m.distance === 0),
  };
}

describe("judgeAndRecordVerifyStatus — service_role write", () => {
  beforeEach(() => {
    updateArgs.length = 0;
    eqCalls.length = 0;
    updateError = null;
    vi.mocked(findActionLogPhashDuplicates).mockReset();
  });

  it("청정 신호 → passed 를 status·model_version 으로 id+user_id AND 필터 UPDATE", async () => {
    vi.mocked(findActionLogPhashDuplicates).mockResolvedValue(dupResult([]));

    const decision = await judgeAndRecordVerifyStatus({
      actionLogId: "log-1",
      userId: "me",
      groupId: "g-1",
      signals: cleanSignals,
      config: theta,
    });

    expect(decision.status).toBe("passed");
    expect(updateArgs).toEqual([
      { auto_verify_status: "passed", auto_verify_model_version: JUDGE_MODEL_VERSION },
    ]);
    expect(eqCalls).toContainEqual(["id", "log-1"]);
    expect(eqCalls).toContainEqual(["user_id", "me"]);
  });

  it("동일-user 재탕(전역 조회에서 발견) → failed 기록 — shadow 에서도 would-be 그대로 write", async () => {
    vi.mocked(findActionLogPhashDuplicates).mockImplementation(async (_phash, scope) =>
      scope.kind === "group" ? dupResult([]) : dupResult([match(1, "me", "log-old")]),
    );

    const decision = await judgeAndRecordVerifyStatus({
      actionLogId: "log-1",
      userId: "me",
      groupId: "g-1",
      signals: cleanSignals,
      config: theta, // enforce=false(shadow) — 기록은 동일
    });

    expect(decision).toEqual({ status: "failed", reason: "same_user_reuse", distance: 1 });
    expect(updateArgs[0]?.auto_verify_status).toBe("failed");
  });

  it("signals=null(계산 오류) → 중복 조회 없이 manual_review graceful 기록", async () => {
    const decision = await judgeAndRecordVerifyStatus({
      actionLogId: "log-1",
      userId: "me",
      groupId: "g-1",
      signals: null,
      config: theta,
    });

    expect(decision).toEqual({ status: "manual_review", reason: "signal_error", distance: null });
    expect(vi.mocked(findActionLogPhashDuplicates)).not.toHaveBeenCalled();
    expect(updateArgs[0]?.auto_verify_status).toBe("manual_review");
  });

  it("UPDATE 에러는 호출자에게 전파(throw)", async () => {
    vi.mocked(findActionLogPhashDuplicates).mockResolvedValue(dupResult([]));
    updateError = { message: "db down" };

    await expect(
      judgeAndRecordVerifyStatus({
        actionLogId: "log-1",
        userId: "me",
        groupId: "g-1",
        signals: cleanSignals,
        config: theta,
      }),
    ).rejects.toEqual({ message: "db down" });
  });
});
