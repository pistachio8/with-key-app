// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextStepCta } from "./next-step-cta";

describe("NextStepCta", () => {
  it("비참가자엔 '참가자가 아니에요' 안내", () => {
    render(<NextStepCta status="pending" isParticipant={false} mySigned={false} isSolo={false} />);
    expect(screen.getByText(/참가자가 아니에요/)).toBeTruthy();
  });

  it("closed 상태엔 '종료된 챌린지' 안내", () => {
    render(<NextStepCta status="closed" isParticipant={true} mySigned={true} isSolo={false} />);
    expect(screen.getByText(/종료된 챌린지/)).toBeTruthy();
  });

  it("pending + 미서명이면 '서약서 쓰러 가기' 링크 노출", () => {
    render(<NextStepCta status="pending" isParticipant={true} mySigned={false} isSolo={true} />);
    const link = screen.getByRole("link", { name: /서약서 쓰러 가기/ });
    expect(link.getAttribute("href")).toBe("/pledge");
  });

  it("accepted + 미서명도 동일한 서약 CTA", () => {
    render(<NextStepCta status="accepted" isParticipant={true} mySigned={false} isSolo={false} />);
    expect(screen.getByRole("link", { name: /서약서 쓰러 가기/ })).toBeTruthy();
  });

  it("pending + 서명완료 + 솔로면 '잠시 후 시작됩니다' 안내", () => {
    render(<NextStepCta status="pending" isParticipant={true} mySigned={true} isSolo={true} />);
    expect(screen.getByText(/잠시 후 시작됩니다/)).toBeTruthy();
  });

  it("pending + 서명완료 + 그룹이면 '다른 멤버 서명 대기 중' 안내", () => {
    render(<NextStepCta status="pending" isParticipant={true} mySigned={true} isSolo={false} />);
    expect(screen.getByText(/다른 멤버 서명 대기 중/)).toBeTruthy();
  });

  it("active 상태는 null 반환 (FAB 으로 인증 진입)", () => {
    const { container } = render(
      <NextStepCta status="active" isParticipant={true} mySigned={true} isSolo={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
