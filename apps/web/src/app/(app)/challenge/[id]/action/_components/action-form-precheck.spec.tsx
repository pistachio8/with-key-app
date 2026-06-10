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

const precheckPhotoFile = vi.fn();
vi.mock("@/lib/verify/precheck", () => ({
  precheckPhotoFile: (...args: unknown[]) => precheckPhotoFile(...args),
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { ActionForm } from "./action-form";

const challengeId = "00000000-0000-4000-8000-000000000023";

function cleanPrecheck() {
  return {
    modelVersion: "verify-precheck-v1",
    shouldRetake: false,
    reasons: [],
    blur: { variance: 500, threshold: 80, suspected: false },
    screenshot: { suspected: false, reasons: [] },
  };
}

function suspiciousPrecheck() {
  return {
    modelVersion: "verify-precheck-v1",
    shouldRetake: true,
    reasons: ["blurry", "screenshot"],
    blur: { variance: 0, threshold: 80, suspected: true },
    screenshot: { suspected: true, reasons: ["no-camera-exif", "device-screen-dimensions"] },
  };
}

function selectPhoto(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function selectFirstKeyword() {
  const group = screen.getByRole("group", { name: "키워드 선택" });
  fireEvent.click(within(group).getAllByRole("button")[0]);
}

describe("ActionForm photo precheck advice", () => {
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
    precheckPhotoFile.mockResolvedValue(cleanPrecheck());
    URL.createObjectURL = vi.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = vi.fn();
    window.localStorage.clear();
  });

  it("shows non-blocking retake advice for blurry screenshot-like photos", async () => {
    precheckPhotoFile.mockResolvedValueOnce(suspiciousPrecheck());
    render(<ActionForm challengeId={challengeId} />);

    selectPhoto(new File([new Uint8Array(10)], "screenshot.jpg", { type: "image/jpeg" }));

    expect(await screen.findByAltText("사진 미리보기")).toBeInTheDocument();
    expect(screen.getByText("다시 찍는 게 좋아 보여요")).toBeInTheDocument();
    expect(screen.getByText("사진이 흐릿해 보여요")).toBeInTheDocument();
    expect(screen.getByText("스크린샷처럼 보여요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 찍기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "그대로 진행" })).toBeEnabled();
  });

  it("allows continuing and submitting after the retake advice", async () => {
    precheckPhotoFile.mockResolvedValueOnce(suspiciousPrecheck());
    render(<ActionForm challengeId={challengeId} />);

    const file = new File([new Uint8Array(10)], "screenshot.jpg", { type: "image/jpeg" });
    selectPhoto(file);
    await screen.findByText("다시 찍는 게 좋아 보여요");
    selectFirstKeyword();

    const submitButton = screen.getByRole("button", { name: "등록하기" }) as HTMLButtonElement;
    expect(submitButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "그대로 진행" }));
    expect(screen.queryByText("다시 찍는 게 좋아 보여요")).not.toBeInTheDocument();
    fireEvent.click(submitButton);

    await waitFor(() => expect(submitActionLog).toHaveBeenCalledTimes(1));
    const formData = submitActionLog.mock.calls[0][0] as FormData;
    expect(formData.get("photo")).toBe(file);
  });

  it("retake clears the photo and dismisses the advice", async () => {
    precheckPhotoFile.mockResolvedValueOnce(suspiciousPrecheck());
    render(<ActionForm challengeId={challengeId} />);

    selectPhoto(new File([new Uint8Array(10)], "screenshot.jpg", { type: "image/jpeg" }));
    await screen.findByText("다시 찍는 게 좋아 보여요");

    // "다시 찍기" → clearPhoto: 사진·권고·precheck 상태 모두 리셋되어 empty state 로 복귀.
    // (cameraInputRef.click() 의 카메라 앱 실행은 jsdom 검증 불가 — 실기/e2e 영역)
    fireEvent.click(screen.getByRole("button", { name: "다시 찍기" }));

    await waitFor(() =>
      expect(screen.queryByText("다시 찍는 게 좋아 보여요")).not.toBeInTheDocument(),
    );
    expect(screen.queryByAltText("사진 미리보기")).not.toBeInTheDocument();
  });
});
