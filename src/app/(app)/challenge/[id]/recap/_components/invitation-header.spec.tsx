// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InvitationHeader } from "./invitation-header";

describe("InvitationHeader", () => {
  const base = {
    groupName: "우리 그룹",
    title: "주 3회 헬스장",
    startAt: "2026-05-05T00:00:00Z",
    endAt: "2026-05-20T00:00:00Z",
    durationDays: 16,
  };

  it("그룹명 · 챌린지명 · 기간 일수를 자동 카피로 결합", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/우리 그룹의 주 3회 헬스장/)).toBeTruthy();
    expect(screen.getByText(/그 16일의 기록/)).toBeTruthy();
  });

  it("기간을 YYYY · MM · DD — MM · DD 포맷으로 표시", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/2026\s*·\s*05\s*·\s*05/)).toBeTruthy();
    expect(screen.getByText(/05\s*·\s*20/)).toBeTruthy();
  });

  it("A MEMOIR eyebrow 표시", () => {
    render(<InvitationHeader {...base} />);
    expect(screen.getByText(/A MEMOIR/i)).toBeTruthy();
  });
});
