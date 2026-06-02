import { describe, expect, it } from "vitest";
import { defaultGroupBaseName, nextDefaultGroupName } from "./default-name";

describe("default group names", () => {
  it("builds the first default name from displayName", () => {
    expect(defaultGroupBaseName("민지")).toBe("민지님과 친구들");
  });

  it("falls back to 내 when displayName is blank", () => {
    expect(defaultGroupBaseName(" ")).toBe("내님과 친구들");
  });

  it("adds #N based on existing default-pattern names only", () => {
    expect(
      nextDefaultGroupName("민지", ["민지님과 친구들", "민지님과 친구들 #2", "직장 크루"]),
    ).toBe("민지님과 친구들 #3");
  });

  it("keeps suffixed names within the DB max length", () => {
    const name = nextDefaultGroupName("가".repeat(20), [
      `${"가".repeat(20)}님과 친구들`,
      `${"가".repeat(20)}님과 친구들 #2`,
      `${"가".repeat(20)}님과 친구들 #3`,
      `${"가".repeat(20)}님과 친구들 #4`,
      `${"가".repeat(20)}님과 친구들 #5`,
      `${"가".repeat(20)}님과 친구들 #6`,
      `${"가".repeat(20)}님과 친구들 #7`,
      `${"가".repeat(20)}님과 친구들 #8`,
      `${"가".repeat(20)}님과 친구들 #9`,
    ]);

    expect(name).toHaveLength(30);
    expect(name.endsWith(" #10")).toBe(true);
  });
});
