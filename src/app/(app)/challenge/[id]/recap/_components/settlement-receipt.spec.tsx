// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementReceipt } from "./settlement-receipt";

const base = {
  title: "아침 루틴",
  durationDays: 12, // 2주(주1: 7일·주2: 자투리 5일)
  startAt: "2026-05-01T00:00:00Z",
  endAt: "2026-05-12T00:00:00Z",
  goalCount: 3, // 주 단위 빈도 (1~7)
  elapsedWeeks: 2,
  achievedWeeks: 1,
  members: [
    { id: "a", displayName: "민지", isMvp: true },
    { id: "b", displayName: "현우", isMvp: false },
  ],
};

describe("SettlementReceipt", () => {
  it("그룹 미달: 항목 + TERRA 금액 + CREW + ACCOUNT + 미달 footer 렌더", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
        groupId={null}
      />,
    );
    expect(screen.getByText(/우리 그룹/)).toBeTruthy();
    expect(screen.getByText("주 3회")).toBeTruthy(); // 목표 (주간 빈도)
    expect(screen.getByText("2주 중 1주")).toBeTruthy(); // 주차 달성
    expect(screen.getByText("9회")).toBeTruthy(); // 나의 인증
    expect(screen.getByText(/미달/)).toBeTruthy();
    expect(screen.getByText("4,000원")).toBeTruthy();
    expect(screen.getByText(/👑 민지/)).toBeTruthy(); // 왕관이 이름 왼쪽
    expect(screen.getByText(/KB국민/)).toBeTruthy();
    expect(screen.getByText(/1234/)).toBeTruthy();
    expect(screen.getByText(/수고했어요/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "from·with" })).toBeTruthy(); // 도장
  });

  it("달성: 0원 + 달성 판정 + 축하 footer (트레일링 이모지 없음)", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={12}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
        groupId={null}
      />,
    );
    expect(screen.getByText("0원")).toBeTruthy();
    expect(screen.getByText("달성 🎉")).toBeTruthy(); // 판정 (주차 달성 라벨과 구분)
    expect(screen.getByText(/끝까지 해냈어요/)).toBeTruthy();
  });

  it("솔로: CREW·ACCOUNT 미렌더, 그룹명 미표시", () => {
    render(
      <SettlementReceipt
        title="아침 루틴"
        durationDays={12}
        startAt="2026-05-01T00:00:00Z"
        endAt="2026-05-12T00:00:00Z"
        goalCount={3}
        elapsedWeeks={2}
        achievedWeeks={2}
        members={[{ id: "a", displayName: "민지", isMvp: true }]}
        groupName={null}
        isSolo={true}
        viewerDoneCount={12}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        bankCode="004"
        accountHolder="김민지"
        accountNumberLast4="1234"
        groupId={null}
      />,
    );
    expect(screen.queryByText("CREW")).toBeNull();
    expect(screen.queryByText("ACCOUNT")).toBeNull();
    expect(screen.queryByText(/우리 그룹/)).toBeNull();
  });

  it("계좌 미설정(null): ACCOUNT 줄 미렌더, CREW 는 표시", () => {
    render(
      <SettlementReceipt
        {...base}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode={null}
        accountHolder={null}
        accountNumberLast4={null}
        groupId={null}
      />,
    );
    expect(screen.queryByText("ACCOUNT")).toBeNull();
    expect(screen.getByText("CREW")).toBeTruthy();
  });

  it("기간(startAt/endAt) null: 기간 줄 없이도 본체 렌더", () => {
    render(
      <SettlementReceipt
        {...base}
        startAt={null}
        endAt={null}
        groupName="우리 그룹"
        isSolo={false}
        viewerDoneCount={9}
        viewerAchieved={false}
        viewerPerHeadPenalty={4000}
        bankCode={null}
        accountHolder={null}
        accountNumberLast4={null}
        groupId={null}
      />,
    );
    expect(screen.getByText("4,000원")).toBeTruthy();
  });
});
