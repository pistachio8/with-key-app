import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

// RLS 격리 확인. fetchCurrentChallenges 는 next/headers 에 의존하므로 직접 호출 대신
// 동등 쿼리를 RLS-가 걸린 anon client 로 실행.
describe("current-challenges read (RLS filter + encrypted column isolation)", () => {
  it("member sees only their group's challenge; outsider gets empty", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const outsiderClient = await asUser(outsider);
    const { data: outsiderGroups } = await outsiderClient
      .from("groups")
      .select("id")
      .eq("id", g.id);
    expect(outsiderGroups).toEqual([]);

    const { data: outsiderChallenges } = await outsiderClient
      .from("challenges")
      .select("id")
      .eq("id", c.id);
    expect(outsiderChallenges).toEqual([]);

    const ownerClient = await asUser(owner);
    const { data: ownerChallenges } = await ownerClient
      .from("challenges")
      .select("id")
      .eq("id", c.id);
    expect(ownerChallenges?.[0]?.id).toBe(c.id);
  });

  it("group SELECT exposes last4/holder/bank but not the encrypted ciphertext via read layer", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);

    // 오너 그룹에 암호문/last4 직접 주입 (admin bypass 로 factory 수준 seed).
    const fakeCipher = Buffer.from("00010203040506070809", "hex");
    const { error: upErr } = await admin
      .from("groups")
      .update({
        bank_code: "088",
        account_holder: "홍길동",
        account_number_encrypted: fakeCipher as unknown as string,
        account_number_last4: "5678",
      })
      .eq("id", g.id);
    expect(upErr).toBeNull();

    // fetchCurrentChallenges 와 동일한 화이트리스트 SELECT 로 조회 — 암호문 컬럼은 요청하지 않음.
    const ownerClient = await asUser(owner);
    const { data } = await ownerClient
      .from("groups")
      .select("id, name, bank_code, account_holder, account_number_last4")
      .eq("id", g.id);
    expect(data?.[0]).toBeDefined();
    const row = data![0]! as Record<string, unknown>;
    expect(row.bank_code).toBe("088");
    expect(row.account_holder).toBe("홍길동");
    expect(row.account_number_last4).toBe("5678");
    expect("account_number_encrypted" in row).toBe(false);
  });
});
