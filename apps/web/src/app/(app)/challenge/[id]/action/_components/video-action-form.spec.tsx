// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const toastInfo = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastInfo(...args), {
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

const submitActionLog = vi.fn();
vi.mock("../_actions", () => ({
  submitActionLog: (...args: unknown[]) => submitActionLog(...args),
}));

import { VideoActionForm } from "./video-action-form";

// 카메라 상태머신 최소 모킹 — getUserMedia + MediaRecorder. onstop 을 동기 발화해
// recordedFile 을 채워 submit() 경로(녹화→제출)를 구동한다.
class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "video/webm";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

const SUCCESS_BASE = {
  id: "log-1",
  summary: "ok",
  photoAttached: true,
  isFirstAction: false,
  currentDay: 3,
  totalDays: 30,
  verifiedDays: [1, 2, 3],
  goalReached: false,
  goalCount: 12,
};

async function recordAndReachSubmit() {
  // idle → 촬영하기(requestCamera) → ready → 녹화 시작 → recording → 녹화 정지 → recorded
  fireEvent.click(screen.getByRole("button", { name: /촬영하기/ }));
  await screen.findByRole("button", { name: /녹화 시작/ });
  fireEvent.click(screen.getByRole("button", { name: /녹화 시작/ }));
  fireEvent.click(screen.getByRole("button", { name: /녹화 정지/ }));
  await screen.findByRole("button", { name: /이 영상으로 인증/ });
}

describe("VideoActionForm — EVAL-0049 안 A", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      configurable: true,
    });
    // jsdom 은 video.play()/srcObject 미구현 — requestCamera 의 try 가 catch 로 빠져
    // phase 가 idle 에 머무는 걸 막는다(실제 카메라 동작이 아니라 상태 전이만 검증).
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      writable: true,
      configurable: true,
      value: null,
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn().mockReturnValue("blob:clip");
    URL.revokeObjectURL = vi.fn();
  });

  it("alreadyVerifiedToday 응답이면 모달 대신 toast 로 피드백하고 피드로 이동한다", async () => {
    submitActionLog.mockResolvedValue({
      ok: true,
      data: { ...SUCCESS_BASE, alreadyVerifiedToday: true },
    });

    render(<VideoActionForm challengeId="c-1" />);
    await recordAndReachSubmit();
    fireEvent.click(screen.getByRole("button", { name: /이 영상으로 인증/ }));

    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("피드에 올렸어요"));
    expect(replace).toHaveBeenCalledWith("/challenge/c-1");
    expect(screen.queryByText("매일 한 걸음씩 쌓이고 있어요 💪")).toBeNull();
  });

  it("그날 첫 카운트(alreadyVerifiedToday=false)면 완료 모달을 유지한다", async () => {
    submitActionLog.mockResolvedValue({
      ok: true,
      data: { ...SUCCESS_BASE, alreadyVerifiedToday: false },
    });

    render(<VideoActionForm challengeId="c-1" />);
    await recordAndReachSubmit();
    fireEvent.click(screen.getByRole("button", { name: /이 영상으로 인증/ }));

    await waitFor(() => expect(screen.getByText("매일 한 걸음씩 쌓이고 있어요 💪")).toBeTruthy());
    expect(toastInfo).not.toHaveBeenCalledWith("피드에 올렸어요");
    expect(replace).not.toHaveBeenCalled();
  });
});
