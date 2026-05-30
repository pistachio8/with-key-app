// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PhotoGallery } from "./photo-gallery";

const photos = [
  {
    id: "1",
    signedUrl: "https://sig/a.jpg",
    takenAt: "2026-05-05T00:00:00Z",
    ownerDisplayName: "민지",
    ownerId: "u-1",
  },
  {
    id: "2",
    signedUrl: "https://sig/b.jpg",
    takenAt: "2026-05-06T00:00:00Z",
    ownerDisplayName: "JJ",
    ownerId: "u-2",
  },
];

describe("PhotoGallery", () => {
  it("photos 가 0장이면 null (렌더 결과 비어 있음)", () => {
    const { container } = render(<PhotoGallery photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("N장이면 그리드 썸네일 N개 렌더", () => {
    render(<PhotoGallery photos={photos} />);
    expect(screen.getAllByRole("button", { name: /사진 보기/ })).toHaveLength(2);
  });

  it("썸네일 클릭 시 lightbox 열림 (작성자 표시)", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button", { name: /사진 보기/ })[0]);
    expect(screen.getByText("민지")).toBeTruthy();
  });
});
