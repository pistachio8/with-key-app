"use server";

import { z } from "zod";
import { kudosInputSchema, type KudosInput } from "@/lib/validators/kudos";
import { decryptAccountNumber } from "@/lib/crypto/account-cipher";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type KudosResult = { toggled: "added" | "removed" };

// BE_SCHEMA §8.6. UNIQUE (action_log_id, user_id, emoji) 로 토글.
export const toggleKudos = withUser<KudosInput, KudosResult>(
  async (user, input): Promise<ActionResult<KudosResult>> => {
    const parsed = kudosInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("kudos")
      .select("id")
      .eq("action_log_id", parsed.data.actionLogId)
      .eq("user_id", user.id)
      .eq("emoji", parsed.data.emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("kudos").delete().eq("id", existing.id);
      if (error) return failure(mapSupabaseError(error));
      return success({ toggled: "removed" });
    }

    const { error } = await supabase.from("kudos").insert({
      action_log_id: parsed.data.actionLogId,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
    if (error) return failure(mapSupabaseError(error));

    void track(
      {
        name: "kudos_given",
        props: { actionLogId: parsed.data.actionLogId, emoji: parsed.data.emoji },
      },
      { userId: user.id },
    );

    return success({ toggled: "added" });
  },
);

// D-016: 그룹 오너가 등록한 계좌번호 평문을 복사 버튼에 제공.
// 암호문 SELECT 는 이 함수 한 경로만 — RLS(`groups_select_member`)가 비멤버 차단.
const revealInputSchema = z.object({ groupId: z.string().uuid() });
type RevealInput = z.infer<typeof revealInputSchema>;

export const revealAccountNumber = withUser<RevealInput, { accountNumber: string }>(
  async (user, input): Promise<ActionResult<{ accountNumber: string }>> => {
    const parsed = revealInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .select("account_number_encrypted")
      .eq("id", parsed.data.groupId)
      .maybeSingle();

    if (error) {
      console.error("[revealAccountNumber] select failed", {
        groupId: parsed.data.groupId,
        error,
      });
      return failure("upstream_error");
    }
    // RLS 로 필터링됐거나 계좌 미등록.
    if (!data || !data.account_number_encrypted) {
      return failure("not_found");
    }

    let plaintext: string;
    try {
      const buf = bytesFromSupabase(data.account_number_encrypted);
      plaintext = decryptAccountNumber(buf);
    } catch (err) {
      // 평문/암호문은 로그에 절대 싣지 않음. 원인 클래스만.
      console.error("[revealAccountNumber] decrypt failed", {
        groupId: parsed.data.groupId,
        errorName: err instanceof Error ? err.name : "unknown",
      });
      return failure("upstream_error");
    }

    void track(
      { name: "account_copied", props: { groupId: parsed.data.groupId } },
      { userId: user.id },
    );

    return success({ accountNumber: plaintext });
  },
);

// supabase-js 는 bytea 를 '\x..' hex escape 문자열로 반환. Uint8Array 케이스도 수용.
function bytesFromSupabase(raw: unknown): Buffer {
  if (typeof raw === "string") {
    const hex = raw.startsWith("\\x") ? raw.slice(2) : raw;
    return Buffer.from(hex, "hex");
  }
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  throw new Error("unexpected bytea shape");
}
