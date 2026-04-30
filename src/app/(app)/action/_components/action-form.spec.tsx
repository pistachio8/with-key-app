// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ActionForm } from "./action-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const submitActionLog = vi.fn();
vi.mock("../_actions", () => ({
  submitActionLog: (...args: unknown[]) => submitActionLog(...args),
}));

function selectFirstKeyword() {
  const group = screen.getByRole("group", { name: "키워드 선택" });
  fireEvent.click(within(group).getAllByRole("button")[0]);
}

describe("ActionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitActionLog.mockResolvedValue({ ok: true, data: { id: "log-1", photoAttached: true } });
    URL.createObjectURL = vi.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows a preview after selecting a photo", () => {
    render(<ActionForm challengeId="00000000-0000-4000-8000-000000000001" />);
    const input = screen.getByLabelText("사진 선택", {
      selector: 'input[type="file"]',
    });
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByAltText("사진 미리보기")).toBeTruthy();
  });

  it("removes the preview and revokes the blob URL", () => {
    render(<ActionForm challengeId="00000000-0000-4000-8000-000000000001" />);
    const input = screen.getByLabelText("사진 선택", {
      selector: 'input[type="file"]',
    });
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /사진 제거/ }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(screen.queryByAltText("사진 미리보기")).toBeNull();
  });

  it("submits a FormData payload with the selected photo", async () => {
    render(<ActionForm challengeId="00000000-0000-4000-8000-000000000001" />);
    selectFirstKeyword();
    const input = screen.getByLabelText("사진 선택", {
      selector: 'input[type="file"]',
    });
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "인증하기" }));

    await waitFor(() => expect(submitActionLog).toHaveBeenCalledTimes(1));
    const formData = submitActionLog.mock.calls[0][0] as FormData;
    expect(formData.get("challengeId")).toBe("00000000-0000-4000-8000-000000000001");
    expect(formData.get("photo")).toBeInstanceOf(File);
    expect(toastSuccess).toHaveBeenCalledWith("인증 완료!");
    expect(push).toHaveBeenCalledWith("/home");
  });
});
