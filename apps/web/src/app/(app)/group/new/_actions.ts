"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { groupInputSchema } from "@/lib/validators/group";
import { encryptAccountNumber } from "@/lib/crypto/account-cipher";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { nextDefaultGroupName } from "@/lib/groups/default-name";

const createGroupInputSchema = groupInputSchema;

export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

// Buffer → Postgres bytea hex escape format (`\x..`). supabase-js 는 Buffer 를 직접
// 직렬화하지 못하므로 문자열로 변환해서 RPC 에 전달한다.
function toPgByteaHex(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

// BE_SCHEMA §5.2 · RPC create_group_with_owner (0017 migration).
// D-016: 평문 계좌번호는 서버 Action 안에서만 접근 → AES-GCM 암호화 후 bytea hex 로 RPC 전달.
// 평문은 DB/RPC/로그/analytics 어디에도 흘러가지 않는다.
export const createGroup = withUser<CreateGroupInput, { id: string; name: string }>(
  async (user, input): Promise<ActionResult<{ id: string; name: string }>> => {
    const normalizedInput = {
      ...input,
      name: typeof input.name === "string" ? input.name.trim() || undefined : input.name,
    };
    const parsed = createGroupInputSchema.safeParse(normalizedInput);
    if (!parsed.success) return validationFailure(parsed.error);

    const { bankCode, accountHolder, accountNumber } = parsed.data;
    const hasAccount =
      bankCode !== undefined && accountHolder !== undefined && accountNumber !== undefined;

    const encryptedHex = hasAccount ? toPgByteaHex(encryptAccountNumber(accountNumber)) : null;
    const last4 = hasAccount ? accountNumber.slice(-4) : null;

    const supabase = await createClient();
    let name = parsed.data.name;
    if (!name) {
      const { data: me, error: meError } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (meError) return failure(mapSupabaseError(meError));

      const { data: existingGroups, error: groupsError } = await supabase
        .from("groups")
        .select("name")
        .eq("owner_id", user.id)
        .is("disbanded_at", null);
      if (groupsError) return failure(mapSupabaseError(groupsError));

      name = nextDefaultGroupName(
        me?.display_name ?? "내",
        (existingGroups ?? []).map((group) => group.name as string | null),
      );
    }

    const { data, error } = await supabase.rpc("create_group_with_owner", {
      p_name: name,
      p_bank_code: bankCode ?? null,
      p_account_holder: accountHolder ?? null,
      p_account_number_encrypted: encryptedHex,
      p_account_number_last4: last4,
    });

    if (error) return failure(mapSupabaseError(error));
    if (!data || typeof data !== "string") return failure("upstream_error");

    void track(
      {
        name: "group_created",
        props: {
          groupId: data,
          memberTarget: 4,
          hasAccount,
        },
      },
      { userId: user.id },
    );

    // (app) layout 의 fetchMyGroups()/fetchOwnerGroupsForChallengeForm() 캐시 무효화 —
    // 헤더 sheet 와 challenge 폼 select 에 새 그룹이 즉시 노출되도록.
    revalidatePath("/", "layout");

    return success({ id: data, name });
  },
);
