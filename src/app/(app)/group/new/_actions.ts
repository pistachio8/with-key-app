"use server";

import { z } from "zod";
import { groupInputSchema } from "@/lib/validators/group";
import { encryptAccountNumber } from "@/lib/crypto/account-cipher";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import {
  success,
  failure,
  validationFailure,
  type ActionResult,
} from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

// 폼 입력. 생성 플로우에서는 name 이 필수 — groupInputSchema 의 optional 을 required 로 좁힌다.
const createGroupInputSchema = z.intersection(
  z.object({ name: z.string().min(1).max(30) }),
  groupInputSchema,
);

export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;

// Buffer → Postgres bytea hex escape format (`\x..`). supabase-js 는 Buffer 를 직접
// 직렬화하지 못하므로 문자열로 변환해서 RPC 에 전달한다.
function toPgByteaHex(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

// BE_SCHEMA §5.2 · RPC create_group_with_owner (0017 migration).
// D-016: 평문 계좌번호는 서버 Action 안에서만 접근 → AES-GCM 암호화 후 bytea hex 로 RPC 전달.
// 평문은 DB/RPC/로그/analytics 어디에도 흘러가지 않는다.
export const createGroup = withUser<CreateGroupInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = createGroupInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const { name, bankCode, accountHolder, accountNumber } = parsed.data;
    const hasAccount =
      bankCode !== undefined && accountHolder !== undefined && accountNumber !== undefined;

    const encryptedHex = hasAccount ? toPgByteaHex(encryptAccountNumber(accountNumber)) : null;
    const last4 = hasAccount ? accountNumber.slice(-4) : null;

    const supabase = await createClient();
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

    return success({ id: data });
  },
);
