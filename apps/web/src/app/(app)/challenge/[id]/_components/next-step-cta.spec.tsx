// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextStepCta } from "./next-step-cta";

describe("NextStepCta", () => {
  it("pending 비참가자엔 '참가자가 아니에요' 안내", () => {
    render(<NextStepCta phase="pending" isParticipant={false} mySigned={false} isSolo={false} />);
    expect(screen.getByText(/참가자가 아니에요/)).toBeTruthy();
  });

  it("running 비참가자엔 다음 챌린지 안내", () => {
    render(<NextStepCta phase="running" isParticipant={false} mySigned={false} isSolo={false} />);
    expect(screen.getByText(/다음 챌린지부터 함께해요/)).toBeTruthy();
  });

  it("closed 상태엔 '종료된 챌린지' 안내", () => {
    render(<NextStepCta phase="closed" isParticipant={true} mySigned={true} isSolo={false} />);
    expect(screen.getByText(/종료된 챌린지/)).toBeTruthy();
  });

  it("over(만기) 도 closed 처럼 '종료된 챌린지' 안내", () => {
    render(<NextStepCta phase="over" isParticipant={true} mySigned={true} isSolo={false} />);
    expect(screen.getByText(/종료된 챌린지/)).toBeTruthy();
  });

  it("pending + 미서명이면 '서약서 쓰러 가기' 링크 노출", () => {
    render(<NextStepCta phase="pending" isParticipant={true} mySigned={false} isSolo={true} />);
    const link = screen.getByRole("link", { name: /서약서 쓰러 가기/ });
    expect(link.getAttribute("href")).toBe("/pledge");
  });

  it("accepted + 미서명도 동일한 서약 CTA", () => {
    render(<NextStepCta phase="accepted" isParticipant={true} mySigned={false} isSolo={false} />);
    expect(screen.getByRole("link", { name: /서약서 쓰러 가기/ })).toBeTruthy();
  });

  it("pending + 서명완료 + 솔로면 '혼자 시작' 안내", () => {
    render(<NextStepCta phase="pending" isParticipant={true} mySigned={true} isSolo={true} />);
    expect(screen.getByText(/혼자 시작/)).toBeTruthy();
  });

  it("pending + 서명완료 + 그룹이면 운영자 확정 안내", () => {
    render(<NextStepCta phase="pending" isParticipant={true} mySigned={true} isSolo={false} />);
    expect(screen.getByText(/운영자가 멤버를 확정하면 시작/)).toBeTruthy();
  });

  it("running 상태는 null 반환 (FAB 으로 인증 진입)", () => {
    const { container } = render(
      <NextStepCta phase="running" isParticipant={true} mySigned={true} isSolo={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
