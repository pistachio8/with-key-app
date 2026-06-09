// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastInfo(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

const submitActionLog = vi.fn();
vi.mock("../_actions", () => ({
  submitActionLog: (...args: unknown[]) => submitActionLog(...args),
}));

const prepareForUpload = vi.fn();
vi.mock("@/lib/image/prepare-upload", () => ({
  prepareForUpload: (...args: unknown[]) => prepareForUpload(...args),
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { ActionForm } from "./action-form";
import { initialShuffle } from "@withkey/domain";

function getHiddenInputs() {
  return Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
}

function selectPhoto(file: File) {
  // 첫 번째 hidden input(camera) 으로 파일 주입 — 라이브러리 input과 동등.
  const inputs = getHiddenInputs();
  fireEvent.change(inputs[0], { target: { files: [file] } });
}

function selectFirstKeyword() {
  const group = screen.getByRole("group", { name: "키워드 선택" });
  fireEvent.click(within(group).getAllByRole("button")[0]);
}

const challengeId = "00000000-0000-4000-8000-000000000001";

describe("ActionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitActionLog.mockResolvedValue({
      ok: true,
      data: {
        id: "log-1",
        photoAttached: true,
        isFirstAction: false,
        currentDay: 3,
        totalDays: 30,
      },
    });
    prepareForUpload.mockImplementation((file: File) => Promise.resolve(file));
    URL.createObjectURL = vi.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = vi.fn();
    window.localStorage.clear();
  });

  it("renders the empty-state dual entry (camera Fab + library link) when no photo", () => {
    render(<ActionForm challengeId={challengeId} />);
    expect(screen.getByRole("button", { name: /사진 찍기/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /사진에서 선택/ })).toBeTruthy();
    // 키워드/등록 UI는 empty state에서 미렌더.
    expect(screen.queryByRole("group", { name: "키워드 선택" })).toBeNull();
    expect(screen.queryByRole("button", { name: /등록하기/ })).toBeNull();
  });

  it("shows a preview after selecting a photo", async () => {
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    expect(await screen.findByAltText("사진 미리보기")).toBeTruthy();
    expect(prepareForUpload).toHaveBeenCalledWith(file);
  });

  it("removes the preview and revokes the blob URL", async () => {
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByAltText("사진 미리보기");
    fireEvent.click(screen.getByRole("button", { name: /사진 제거/ }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(screen.queryByAltText("사진 미리보기")).toBeNull();
  });

  it("submits a FormData payload with the prepared photo", async () => {
    const prepared = new File([new Uint8Array(5)], "photo.jpg", { type: "image/jpeg" });
    prepareForUpload.mockResolvedValueOnce(prepared);
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByAltText("사진 미리보기");
    selectFirstKeyword();
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    await waitFor(() => expect(submitActionLog).toHaveBeenCalledTimes(1));
    const formData = submitActionLog.mock.calls[0][0] as FormData;
    expect(formData.get("challengeId")).toBe(challengeId);
    expect(formData.get("photo")).toBe(prepared);
    // 성공 시 ActionResultDialog 가 열리고, router.push 는 호출되지 않음.
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves the shuffled keyword set when toggling activity and returning", async () => {
    // 활동 토글이 RerollButton(5회 cap) 우회 경로가 되지 않도록 활동별 shuffle 을
    // 캐시한다. 처음 본 gym 의 키워드 셋이 running 왕복 후에도 동일해야 한다.
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByAltText("사진 미리보기");

    const initialKeywords = within(screen.getByRole("group", { name: "키워드 선택" }))
      .getAllByRole("button")
      .map((el) => el.textContent);

    fireEvent.click(screen.getByRole("radio", { name: "🏃 러닝" }));
    fireEvent.click(screen.getByRole("radio", { name: "🏋️ 헬스" }));

    const afterReturn = within(screen.getByRole("group", { name: "키워드 선택" }))
      .getAllByRole("button")
      .map((el) => el.textContent);

    expect(afterReturn).toEqual(initialKeywords);
  });

  // 직접 입력 일기 (spec 2026-05-28-action-manual-diary)
  it("submits a direct diary (memo) with no keyword selected", async () => {
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByAltText("사진 미리보기");

    // 키워드 미선택 상태에서는 제출 비활성.
    expect((screen.getByRole("button", { name: "등록하기" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: /직접 쓰고 싶어요/ }));
    const memo = "오늘 헬스 다녀왔어요. 직접 쓴 일기예요.";
    fireEvent.change(screen.getByPlaceholderText(/직접 쓴 일기/), { target: { value: memo } });

    // 직접 모드: 키워드 칩 비활성.
    const group = screen.getByRole("group", { name: "키워드 선택" });
    expect((within(group).getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(true);

    // 키워드 0개여도 제출 가능.
    const submitBtn = screen.getByRole("button", { name: "등록하기" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    await waitFor(() => expect(submitActionLog).toHaveBeenCalledTimes(1));
    const formData = submitActionLog.mock.calls[0][0] as FormData;
    expect(formData.get("memo")).toBe(memo);
    expect(formData.get("selectedKeywords")).toBe("[]");
  });

  it("goalReached 응답이면 '챌린지 성공!' 모달을 띄운다", async () => {
    submitActionLog.mockResolvedValue({
      ok: true,
      data: {
        id: "log-1",
        summary: "ok",
        photoAttached: false,
        isFirstAction: false,
        currentDay: 3,
        totalDays: 14,
        verifiedDays: [1, 2, 3],
        goalReached: true,
        goalCount: 3,
      },
    });
    prepareForUpload.mockImplementation(async (f: File) => f);

    render(<ActionForm challengeId="c-1" />);
    selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("사진 미리보기");
    // 기존 성공 테스트와 동일하게 키워드 1개 선택 후 등록 클릭(같은 헬퍼/흐름 사용).
    selectFirstKeyword();
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    await waitFor(() => expect(screen.getByText("챌린지 성공!")).toBeTruthy());
  });

  it("saves draft on submit failure (F10)", async () => {
    submitActionLog.mockResolvedValueOnce({ ok: false, error: "forbidden" });
    render(<ActionForm challengeId={challengeId} />);
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByAltText("사진 미리보기");
    selectFirstKeyword();
    fireEvent.click(screen.getByRole("button", { name: "등록하기" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const draftRaw = window.localStorage.getItem(`withkey:action-draft:${challengeId}`);
    expect(draftRaw).not.toBeNull();
    const draft = JSON.parse(draftRaw ?? "{}") as { selected: string[]; savedAt: number };
    expect(draft.selected.length).toBeGreaterThan(0);
    expect(typeof draft.savedAt).toBe("number");
  });

  it("clears in-progress photo/keywords when challengeId changes (C6 cross-challenge isolation)", async () => {
    const { rerender } = render(<ActionForm challengeId="c-A" />);
    selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("사진 미리보기");
    selectFirstKeyword();

    // 다른 챌린지(해당 챌린지 draft 없음)로 전환 — A 의 사진/키워드가 남으면 안 된다.
    rerender(<ActionForm challengeId="c-B" />);

    expect(screen.queryByAltText("사진 미리보기")).toBeNull();
    expect(screen.getByRole("button", { name: /사진 찍기/ })).toBeTruthy();
  });

  it("on challengeId change, resets then applies the target challenge's draft (H3 order)", async () => {
    // c-B 에 §4.4 draft 시드 (loadDraft 는 savedAt TTL + shuffleByActivity[activityType] 검증).
    window.localStorage.setItem(
      "withkey:action-draft:c-B",
      JSON.stringify({
        activityType: "gym",
        selected: [],
        shuffleByActivity: { gym: initialShuffle("gym") },
        memo: "B 챌린지 임시 메모",
        memoOpen: true,
        savedAt: Date.now(),
      }),
    );

    const { rerender } = render(<ActionForm challengeId="c-A" />);
    selectPhoto(new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("사진 미리보기");

    rerender(<ActionForm challengeId="c-B" />);

    // A 의 사진은 사라진다(reset).
    expect(screen.queryByAltText("사진 미리보기")).toBeNull();

    // B 의 draft 는 살아있다(apply). 사진을 새로 넣어 키워드/메모 UI 를 드러낸 뒤 확인.
    selectPhoto(new File([new Uint8Array(10)], "b.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("사진 미리보기");
    expect((screen.getByPlaceholderText(/직접 쓴 일기/) as HTMLTextAreaElement).value).toBe(
      "B 챌린지 임시 메모",
    );
  });

  it("restores a draft on first mount unchanged (H3 regression guard)", async () => {
    window.localStorage.setItem(
      `withkey:action-draft:${challengeId}`,
      JSON.stringify({
        activityType: "gym",
        selected: [],
        shuffleByActivity: { gym: initialShuffle("gym") },
        memo: "최초 mount 복원 메모",
        memoOpen: true,
        savedAt: Date.now(),
      }),
    );

    render(<ActionForm challengeId={challengeId} />);
    // 최초 mount 복원: 토스트 발화 + 사진 추가 시 메모 노출.
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("이전 작성을 불러왔어요"));
    selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("사진 미리보기");
    expect((screen.getByPlaceholderText(/직접 쓴 일기/) as HTMLTextAreaElement).value).toBe(
      "최초 mount 복원 메모",
    );
  });
});
