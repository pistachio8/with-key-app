// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const submitFeedback = vi.fn();
vi.mock("../_actions", () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
}));

// prepareForUpload 는 jsdom 에서 canvas 가 없어 동작 불가 — passthrough 로 대체(action-form.spec 패턴).
const prepareForUpload = vi.fn();
vi.mock("@/lib/image/prepare-upload", () => ({
  prepareForUpload: (...args: unknown[]) => prepareForUpload(...args),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => args, {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  }),
}));

import { FeedbackForm } from "./feedback-form";

const png = (n: string) => new File([new Uint8Array([1, 2, 3])], n, { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  prepareForUpload.mockImplementation(async (f: File) => f);
  submitFeedback.mockResolvedValue({ ok: true, data: { ok: true } });
  // 호출마다 고유 blob URL — key={p.url} 중복(React key 경고) 회피.
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${n++}`);
  URL.revokeObjectURL = vi.fn();
});

describe("FeedbackForm 멀티 사진", () => {
  it("여러 장 추가 시 썸네일이 장수만큼 보이고 3장이면 추가 타일이 사라진다", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png("a.png"), png("b.png"), png("c.png")] } });
    expect(await screen.findAllByRole("img")).toHaveLength(3);
    expect(screen.queryByTestId("feedback-photo-add")).toBeNull();
  });

  it("4번째부터는 무시(최대 3)", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [png("a.png"), png("b.png"), png("c.png"), png("d.png")] },
    });
    expect(await screen.findAllByRole("img")).toHaveLength(3);
  });

  it("썸네일 제거 버튼으로 한 장을 지운다", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png("a.png")] } });
    fireEvent.click(await screen.findByLabelText("1번 사진 제거"));
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("사진을 photos 키로 제출한다", async () => {
    render(<FeedbackForm />);
    const input = screen.getByTestId("feedback-photo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png("a.png"), png("b.png")] } });
    await screen.findAllByRole("img");
    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "사진 두 장" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    await vi.waitFor(() => expect(submitFeedback).toHaveBeenCalledOnce());
    const fd = submitFeedback.mock.calls[0][0] as FormData;
    expect(fd.getAll("photos")).toHaveLength(2);
    expect(fd.get("body")).toBe("사진 두 장");
  });
});
