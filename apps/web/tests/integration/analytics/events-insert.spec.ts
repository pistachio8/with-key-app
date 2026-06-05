import { describe, expect, it } from "vitest";
import { track } from "@/lib/analytics/track";
import { admin } from "../setup";
import { createUser } from "../factories";

describe("track() writes to events table", () => {
  it("inserts a row the admin client can read back", async () => {
    const u = await createUser();
    await track(
      {
        name: "kudos_given",
        props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
      },
      { userId: u.id },
    );

    const { data, error } = await admin
      .from("events")
      .select("name, props, user_id")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(error).toBeNull();
    expect(data?.[0]?.name).toBe("kudos_given");
    expect((data?.[0]?.props as Record<string, unknown>).emoji).toBe("🔥");
  });

  it("swallows CHECK-violating names (unknown event -> no row, no throw)", async () => {
    const u = await createUser();
    await track({ name: "nonsense_event" as never, props: {} as never }, { userId: u.id });
    const { data } = await admin.from("events").select("name").eq("user_id", u.id);
    expect(data).toEqual([]);
  });
});
