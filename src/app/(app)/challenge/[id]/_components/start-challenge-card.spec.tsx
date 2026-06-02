// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StartChallengeCard } from "./start-challenge-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../_actions", () => ({ startChallengeWithSignedParticipants: vi.fn() }));

describe("StartChallengeCard", () => {
  it("미서명자가 남아 있으면 기존 안내 문구", () => {
    render(<StartChallengeCard challengeId="c1" signedCount={2} unsignedCount={1} />);
    expect(screen.getByText("시작할 준비가 됐어요")).toBeInTheDocument();
    expect(screen.getByText(/다음 챌린지부터 함께해요/)).toBeInTheDocument();
  });

  it("전원 서명(unsignedCount=0)이면 완료 강조", () => {
    render(<StartChallengeCard challengeId="c1" signedCount={3} unsignedCount={0} />);
    expect(screen.getByText("전원 서명 완료 🎉")).toBeInTheDocument();
    expect(screen.queryByText(/다음 챌린지부터 함께해요/)).not.toBeInTheDocument();
  });
});
