import { describe, it, expect } from "vitest";
import { isUnread } from "./unread-kudos";

describe("isUnread", () => {
  it("last_seen 이 null 이면 unread", () => {
    expect(isUnread({ createdAt: "2026-05-04T00:00:00Z", lastSeenAt: null })).toBe(true);
  });

  it("created_at 이 last_seen 보다 뒤면 unread", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T02:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(true);
  });

  it("created_at 이 last_seen 이전이면 read", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T00:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(false);
  });

  it("정확히 같은 시각은 read (>: strict)", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T01:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(false);
  });
});
