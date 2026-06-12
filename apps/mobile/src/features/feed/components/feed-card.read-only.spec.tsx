// EVAL-0017 — 피드 카드 read-only 렌더: author/photo/keywords/요약/시간 +
// 이미지 로드 실패 폴백, 솔로 kudos 미렌더, 본인 글 "(나)" 표기.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { FeedItemView } from "@withkey/domain";

import { FEED_RESPONSE } from "../../../../../../evals/fixtures/read-contracts/feed";
import { FeedCard } from "./feed-card";

const withPhoto = FEED_RESPONSE[0] as FeedItemView; // 제이, 사진 있음, kudos 🔥2 👏1
const withoutPhoto = FEED_RESPONSE[1] as FeedItemView; // 민지(u1), 사진 없음, kudos 0

describe("FeedCard (read-only)", () => {
  it("author·keywords·요약·시간·kudos 카운트를 렌더한다", () => {
    render(
      <FeedCard item={withPhoto} participantCount={2} timestampLabel="5월 2일" viewerId="u1" />,
    );
    expect(screen.getByText("제이")).toBeTruthy();
    expect(screen.getByText("#러닝")).toBeTruthy();
    expect(screen.getByText("#아침")).toBeTruthy();
    expect(screen.getByText("러닝 30분 완료 — 아침 공기가 상쾌했다.")).toBeTruthy();
    expect(screen.getByText("5월 2일")).toBeTruthy();
    expect(screen.getByText("🔥 2")).toBeTruthy();
    expect(screen.getByText("👏 1")).toBeTruthy();
    // count 0 이모지는 미렌더
    expect(screen.queryByText(/💪/)).toBeNull();
    expect(screen.getByTestId(`feed-card-photo-${withPhoto.id}`)).toBeTruthy();
  });

  it("이미지 로드 실패 시 placeholder 로 폴백하고 크래시하지 않는다", () => {
    render(
      <FeedCard item={withPhoto} participantCount={2} timestampLabel="5월 2일" viewerId="u1" />,
    );
    fireEvent(screen.getByTestId(`feed-card-photo-${withPhoto.id}`), "error");
    expect(screen.queryByTestId(`feed-card-photo-${withPhoto.id}`)).toBeNull();
    expect(screen.getByText("사진을 불러오지 못했어요")).toBeTruthy();
  });

  it("사진이 null 이면 이미지 영역 자체를 렌더하지 않는다", () => {
    render(
      <FeedCard item={withoutPhoto} participantCount={2} timestampLabel="어제" viewerId="u2" />,
    );
    expect(screen.queryByTestId(`feed-card-photo-${withoutPhoto.id}`)).toBeNull();
    expect(screen.queryByText("사진을 불러오지 못했어요")).toBeNull();
  });

  it("본인 글에는 '(나)' 를 붙인다", () => {
    render(
      <FeedCard item={withoutPhoto} participantCount={2} timestampLabel="어제" viewerId="u1" />,
    );
    expect(screen.getByText("민지 (나)")).toBeTruthy();
  });

  it("솔로(1명) 챌린지에서는 kudos 줄을 렌더하지 않는다", () => {
    render(
      <FeedCard item={withPhoto} participantCount={1} timestampLabel="5월 2일" viewerId="u1" />,
    );
    expect(screen.queryByText("🔥 2")).toBeNull();
  });
});
