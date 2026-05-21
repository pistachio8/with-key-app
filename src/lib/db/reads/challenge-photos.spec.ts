import { describe, it, expect } from "vitest";
import { buildChallengePhotosView } from "./challenge-photos";

describe("buildChallengePhotosView", () => {
  it("photo_path null 인 행은 제외", () => {
    const rows = [
      {
        id: "1",
        photo_path: "a.jpg",
        created_at: "2026-05-01T00:00:00Z",
        users: { display_name: "민지" },
      },
      {
        id: "2",
        photo_path: null,
        created_at: "2026-05-02T00:00:00Z",
        users: { display_name: "JJ" },
      },
    ];
    const signedUrls = ["https://signed/a.jpg", null];
    const view = buildChallengePhotosView(rows, signedUrls);
    expect(view).toHaveLength(1);
    expect(view[0].id).toBe("1");
  });

  it("display_name 누락 시 '익명' 폴백", () => {
    const rows = [
      {
        id: "1",
        photo_path: "a.jpg",
        created_at: "2026-05-01T00:00:00Z",
        users: { display_name: null },
      },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/a.jpg"]);
    expect(view[0].ownerDisplayName).toBe("익명");
  });

  it("signedUrl null 인 항목은 제외 (signed URL 발급 실패)", () => {
    const rows = [
      {
        id: "1",
        photo_path: "a.jpg",
        created_at: "2026-05-01T00:00:00Z",
        users: { display_name: "민지" },
      },
      {
        id: "2",
        photo_path: "b.jpg",
        created_at: "2026-05-02T00:00:00Z",
        users: { display_name: "JJ" },
      },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/a.jpg", null]);
    expect(view).toHaveLength(1);
    expect(view[0].id).toBe("1");
  });

  it("RecapPhotoView 모양으로 매핑 — id · signedUrl · takenAt · ownerDisplayName", () => {
    const rows = [
      {
        id: "x",
        photo_path: "p.jpg",
        created_at: "2026-05-05T12:00:00Z",
        users: { display_name: "희수" },
      },
    ];
    const view = buildChallengePhotosView(rows, ["https://signed/p.jpg"]);
    expect(view[0]).toEqual({
      id: "x",
      signedUrl: "https://signed/p.jpg",
      takenAt: "2026-05-05T12:00:00Z",
      ownerDisplayName: "희수",
    });
  });
});
