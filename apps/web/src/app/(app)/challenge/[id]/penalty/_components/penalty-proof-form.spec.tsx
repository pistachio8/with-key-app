// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

const submitPenaltyProof = vi.fn();
vi.mock("../_actions", () => ({
  submitPenaltyProof: (...args: unknown[]) => submitPenaltyProof(...args),
}));

import { PenaltyProofForm } from "./penalty-proof-form";

// 카메라 상태머신 최소 모킹 — getUserMedia + MediaRecorder(video-action-form.spec 패턴 재사용).
// onstop 을 동기 발화해 recordedFile 을 채워 submit() 경로(녹화→제출)를 구동한다.
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

async function recordAndReachSubmit() {
  // idle → 미션 영상 녹화(requestCamera) → ready → 녹화 시작 → recording → 녹화 정지 → recorded
  fireEvent.click(screen.getByRole("button", { name: /미션 영상 녹화/ }));
  await screen.findByRole("button", { name: /녹화 시작/ });
  fireEvent.click(screen.getByRole("button", { name: /녹화 시작/ }));
  fireEvent.click(screen.getByRole("button", { name: /녹화 정지/ }));
  await screen.findByRole("button", { name: /증명 제출하기/ });
}

describe("PenaltyProofForm — 캡처→제출", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      configurable: true,
    });
    // jsdom 은 video.play()/srcObject 미구현 — requestCamera 의 try 가 catch 로 빠지지 않게 보강.
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      writable: true,
      configurable: true,
      value: null,
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn().mockReturnValue("blob:penalty");
    URL.revokeObjectURL = vi.fn();
  });

  it("녹화 후 제출 성공이면 성공 토스트 + router.refresh 로 판정 대기 상태 갱신", async () => {
    submitPenaltyProof.mockResolvedValue({ ok: true, data: { proofId: "p-1", status: "pending" } });

    render(<PenaltyProofForm challengeId="c-1" />);
    await recordAndReachSubmit();
    fireEvent.click(screen.getByRole("button", { name: /증명 제출하기/ }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("증명을 제출했어요. 친구들의 판정을 기다려요."),
    );
    expect(refresh).toHaveBeenCalled();
    // 제출 FormData 에 challengeId·video 가 실린다.
    const formData = submitPenaltyProof.mock.calls[0][0] as FormData;
    expect(formData.get("challengeId")).toBe("c-1");
    expect(formData.get("video")).toBeInstanceOf(File);
  });

  it("제출 실패(forbidden)면 에러 토스트 + refresh 없음", async () => {
    submitPenaltyProof.mockResolvedValue({ ok: false, error: "forbidden" });

    render(<PenaltyProofForm challengeId="c-1" />);
    await recordAndReachSubmit();
    fireEvent.click(screen.getByRole("button", { name: /증명 제출하기/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
