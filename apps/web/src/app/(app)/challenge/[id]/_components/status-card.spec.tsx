// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusCard } from "./status-card";

const baseProps = {
  title: "이번 주 운동",
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 3000,
  ownerName: "민지",
  daysLeft: 5,
  participantCount: 1,
  signedCount: 0,
  isOwner: true,
  phase: "pending" as const,
};

describe("StatusCard socialProof", () => {
  it("pending + solo + owner → '지금 초대하면 함께 시작해요'", () => {
    render(<StatusCard {...baseProps} phase="pending" participantCount={1} signedCount={0} />);
    expect(screen.getByText(/지금 초대하면 함께 시작해요/)).toBeTruthy();
  });

  it("pending + solo + 비owner → '서명 대기 중'", () => {
    render(<StatusCard {...baseProps} phase="pending" participantCount={1} isOwner={false} />);
    expect(screen.getByText("서명 대기 중")).toBeTruthy();
  });

  it("pending + multi → '{signed}/{N}명 서명'", () => {
    render(<StatusCard {...baseProps} phase="pending" participantCount={3} signedCount={1} />);
    expect(screen.getByText("1/3명 서명")).toBeTruthy();
  });

  it("accepted + multi → '모두 서명 완료 · 곧 시작'", () => {
    render(<StatusCard {...baseProps} phase="accepted" participantCount={3} signedCount={3} />);
    expect(screen.getByText("3명 모두 서명 완료 · 곧 시작")).toBeTruthy();
  });

  it("running + solo + owner → '혼자 시작했어요 · 다음 챌린지엔 함께해요'", () => {
    render(<StatusCard {...baseProps} phase="running" participantCount={1} />);
    expect(screen.getByText(/혼자 시작했어요/)).toBeTruthy();
    expect(screen.getByText(/다음 챌린지엔 함께해요/)).toBeTruthy();
  });

  it("running + multi → '{N}명이 함께해요'", () => {
    render(<StatusCard {...baseProps} phase="running" participantCount={3} />);
    expect(screen.getByText("3명이 함께해요")).toBeTruthy();
  });

  it("closed + solo → '혼자 마쳤어요'", () => {
    render(<StatusCard {...baseProps} phase="closed" participantCount={1} />);
    expect(screen.getByText("혼자 마쳤어요")).toBeTruthy();
  });

  it("closed + multi → '{N}명이 함께했어요'", () => {
    render(<StatusCard {...baseProps} phase="closed" participantCount={3} />);
    expect(screen.getByText("3명이 함께했어요")).toBeTruthy();
  });

  it("over(만기) → closed 처럼 '함께했어요' + dayLabel '종료' (D-N 금지)", () => {
    render(<StatusCard {...baseProps} phase="over" participantCount={3} daysLeft={0} />);
    expect(screen.getByText("3명이 함께했어요")).toBeTruthy();
    expect(screen.getByText("종료")).toBeTruthy();
    expect(screen.queryByText(/D-/)).toBeNull();
  });

  it("running → dayLabel 'D-{daysLeft}'", () => {
    render(<StatusCard {...baseProps} phase="running" daysLeft={5} />);
    expect(screen.getByText("D-5")).toBeTruthy();
  });
});
