// @vitest-environment node
// submitActionLog 본문 검증은 submit-core.spec.ts(코어 SoT)로 이전했다 (D-7 spec C1/scenario 4).
// 여기서는 web wrapper 의 배선만 smoke 로 확인하고(코어 호출·updateTag tail), replaceActionPhoto
// (EVAL-0024)의 성공/거부 shape 을 검증한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@test.local",
  },
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  recordVerifySignals: vi.fn().mockResolvedValue(undefined),
  adminFrom: vi.fn(),
  submitActionLogCore: vi.fn(),
}));

vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <TInput, TData>(handler: (user: typeof mocks.user, input: TInput) => Promise<TData>) =>
    (input: TInput) =>
      handler(mocks.user, input),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mocks.supabase),
}));

vi.mock("@/lib/storage/action-photos", () => ({
  uploadPhoto: (...args: unknown[]) => mocks.uploadPhoto(...args),
  deletePhoto: (...args: unknown[]) => mocks.deletePhoto(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: mocks.adminFrom }),
}));

// verify 모듈은 recordVerifySignals 만 사용 — sharp/EXIF 실연산 대신 호출 여부만 검증.
vi.mock("@/lib/verify", () => ({
  recordVerifySignals: (...args: unknown[]) => mocks.recordVerifySignals(...args),
}));

// revalidatePath / updateTag 는 Next.js runtime store 에 의존 — unit test 에서는 no-op mock.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// after(cb) 는 request 컨텍스트 의존 — 테스트에서는 콜백을 즉시 실행.
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    void cb();
  },
}));

// 공유 코어는 submit-core.spec.ts 가 직접 검증 — wrapper smoke 에서는 mock 한다.
vi.mock("@/lib/action-log/submit-core", () => ({
  submitActionLogCore: (...args: unknown[]) => mocks.submitActionLogCore(...args),
}));

import { submitActionLog, replaceActionPhoto } from "./_actions";

const challengeId = "22222222-2222-4222-8222-222222222222";
const actionLogId = "33333333-3333-4333-8333-333333333333";

function makeFormData(): FormData {
  const formData = new FormData();
  formData.append("challengeId", challengeId);
  formData.append("activityType", "gym");
  formData.append("selectedKeywords", JSON.stringify(["펌핑"]));
  formData.append("shownKeywords", JSON.stringify(["펌핑", "하체데이", "스쿼트"]));
  formData.append("rerollCount", "0");
  return formData;
}

describe("submitActionLog (wrapper)", () => {
  const successData = {
    id: actionLogId,
    summary: "오늘도 해냈다.",
    photoAttached: false,
    isFirstAction: true,
    currentDay: 1,
    totalDays: 30,
    verifiedDays: [1],
    goalReached: false,
    goalCount: 7,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitActionLogCore.mockResolvedValue({ ok: true, data: successData });
  });

  it("주입된 cookie client·user 로 공유 코어를 호출한다", async () => {
    const fd = makeFormData();
    await submitActionLog(fd);
    expect(mocks.submitActionLogCore).toHaveBeenCalledWith(mocks.supabase, mocks.user, fd);
  });

  it("성공 시 user-${id}-home-feed 캐시를 updateTag 한다 (Phase 5-1 RYOW)", async () => {
    const { updateTag } = await import("next/cache");
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({ ok: true, data: { id: actionLogId } });
    expect(updateTag).toHaveBeenCalledWith(`user-${mocks.user.id}-home-feed`);
  });

  it("코어 실패 응답은 그대로 전달하고 updateTag 하지 않는다", async () => {
    const { updateTag } = await import("next/cache");
    mocks.submitActionLogCore.mockResolvedValue({ ok: false, error: "forbidden" });
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({ ok: false, error: "forbidden" });
    expect(updateTag).not.toHaveBeenCalled();
  });
});

// EVAL-0024 (WP4) — 마감 전 1회 사진 교체. 1회 제한·마감 가드·부정탐지 재실행의 성공/거부 shape.
describe("replaceActionPhoto", () => {
  const newPath = `${mocks.user.id}/${challengeId}/${actionLogId}-newnonce.jpg`;
  const oldPath = `${mocks.user.id}/${challengeId}/${actionLogId}-oldnonce.jpg`;

  function makeReplaceFormData(file?: File): FormData {
    const fd = new FormData();
    fd.append("challengeId", challengeId);
    fd.append("actionLogId", actionLogId);
    fd.append("photo", file ?? new File([new Uint8Array(1000)], "new.jpg", { type: "image/jpeg" }));
    return fd;
  }

  // select/update/eq/is 는 빌더를 반환하고, maybeSingle 만 결과 Promise 를 돌려주는 체이너블 mock.
  function chain(result: { data: unknown; error: unknown }) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "update", "eq", "is"]) builder[m] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn().mockResolvedValue(result);
    return builder;
  }

  function stubReplace(
    opts: {
      log?: {
        photo_path?: string | null;
        edited_at?: string | null;
        status?: string;
        endAt?: string;
      } | null;
      updated?: { id: string } | null;
      updateError?: { code: string } | null;
    } = {},
  ) {
    const logRow =
      opts.log === null
        ? null
        : {
            // 명시적 null(사진 없이 제출한 로그)과 미지정(기본 oldPath)을 구분 — `??` 는 null 을
            // 삼켜 oldPath 로 만들어버리므로 키 존재 여부로 분기한다.
            photo_path:
              opts.log && "photo_path" in opts.log ? (opts.log.photo_path ?? null) : oldPath,
            edited_at: opts.log?.edited_at ?? null,
            challenges: {
              status: opts.log?.status ?? "active",
              end_at: opts.log?.endAt ?? new Date(Date.now() + 86_400_000).toISOString(),
            },
          };
    const readChain = chain({ data: logRow, error: null });
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "action_logs") return readChain;
      throw new Error(`unexpected table ${table}`);
    });

    const updatedRow = "updated" in opts ? opts.updated : { id: actionLogId };
    const updateChain = chain({ data: updatedRow, error: opts.updateError ?? null });
    mocks.adminFrom.mockReturnValue(updateChain);
    mocks.uploadPhoto.mockResolvedValue({ ok: true, path: newPath });
    return { readChain, updateChain };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordVerifySignals.mockResolvedValue(undefined);
    stubReplace();
  });

  it("마감 전 첫 교체: photo_path·edited_at atomic 갱신 + 직전 사진 정리", async () => {
    const { readChain, updateChain } = stubReplace({
      log: { photo_path: oldPath, edited_at: null },
    });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: true, data: { id: actionLogId, photoPath: newPath } });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ photo_path: newPath, edited_at: expect.any(String) }),
    );
    // 1회 제한의 race-safe 게이트.
    expect(updateChain.is).toHaveBeenCalledWith("edited_at", null);
    // admin write 는 RLS 를 우회하므로 user_id 소유 스코프가 유일 경계 — 회귀 방지로 명시 검증.
    expect(updateChain.eq).toHaveBeenCalledWith("id", actionLogId);
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", mocks.user.id);
    // 선제 read 도 본인 행만 — 소유 필터 회귀 방지.
    expect(readChain.eq).toHaveBeenCalledWith("user_id", mocks.user.id);
    // 직전 사진은 best-effort 정리.
    expect(mocks.deletePhoto).toHaveBeenCalledWith(mocks.user.id, oldPath, mocks.supabase);
  });

  it("교체 시 부정탐지 신호를 새 사진으로 재실행(EVAL-0021)", async () => {
    await replaceActionPhoto(makeReplaceFormData());
    expect(mocks.recordVerifySignals).toHaveBeenCalledWith(
      expect.objectContaining({ actionLogId, userId: mocks.user.id, photo: expect.anything() }),
    );
  });

  it("2회째 차단: edited_at 이 이미 세팅이면 conflict — 업로드·admin write 안 함", async () => {
    stubReplace({ log: { photo_path: oldPath, edited_at: new Date().toISOString() } });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.recordVerifySignals).not.toHaveBeenCalled();
  });

  it("마감 후 차단: end_at 이 지났으면 forbidden — 업로드 안 함", async () => {
    stubReplace({
      log: {
        photo_path: oldPath,
        edited_at: null,
        endAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: false, error: "forbidden" });
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
  });

  it("비활성 챌린지 차단: status!=active 이면 forbidden", async () => {
    stubReplace({ log: { photo_path: oldPath, edited_at: null, status: "closed" } });
    const result = await replaceActionPhoto(makeReplaceFormData());
    expect(result).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("비소유/없는 로그: not_found", async () => {
    stubReplace({ log: null });
    const result = await replaceActionPhoto(makeReplaceFormData());
    expect(result).toMatchObject({ ok: false, error: "not_found" });
  });

  it("동시 교체 race: atomic update 가 0행이면 업로드 object 정리 후 conflict", async () => {
    stubReplace({ log: { photo_path: oldPath, edited_at: null }, updated: null });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect(mocks.deletePhoto).toHaveBeenCalledWith(mocks.user.id, newPath, mocks.supabase);
  });

  it("admin update 에러: 업로드 object 정리 후 매핑된 실패", async () => {
    stubReplace({ log: { photo_path: oldPath, edited_at: null }, updateError: { code: "08006" } });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: false, error: "upstream_error" });
    expect(mocks.deletePhoto).toHaveBeenCalledWith(mocks.user.id, newPath, mocks.supabase);
  });

  it("photo_path 가 null 인 로그(사진 없이 제출) 교체: 직전 사진 삭제 스킵하고 성공", async () => {
    stubReplace({ log: { photo_path: null, edited_at: null } });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: true, data: { photoPath: newPath } });
    // 직전 photo_path 가 없으므로 cleanup deletePhoto 는 호출되지 않는다.
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
  });

  it("업로드 실패: upstream_error — admin write 미호출(edited_at 미변경)", async () => {
    stubReplace({ log: { photo_path: oldPath, edited_at: null } });
    mocks.uploadPhoto.mockResolvedValue({ ok: false, reason: "upload_failed" });
    const result = await replaceActionPhoto(makeReplaceFormData());

    expect(result).toMatchObject({ ok: false, error: "upstream_error" });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("photo 누락: invalid_input", async () => {
    const fd = new FormData();
    fd.append("challengeId", challengeId);
    fd.append("actionLogId", actionLogId);
    const result = await replaceActionPhoto(fd);
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("잘못된 id 형식: invalid_input", async () => {
    const fd = new FormData();
    fd.append("challengeId", "not-a-uuid");
    fd.append("actionLogId", actionLogId);
    fd.append("photo", new File([new Uint8Array(10)], "x.jpg", { type: "image/jpeg" }));
    const result = await replaceActionPhoto(fd);
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
  });
});
