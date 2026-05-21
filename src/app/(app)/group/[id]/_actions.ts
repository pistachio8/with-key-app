// src/app/(app)/group/[id]/_actions.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { renameGroupInputSchema, type RenameGroupInput } from "@/lib/validators/group";
import { track } from "@/lib/analytics/track";
import { generateInviteToken } from "@/lib/invite/token";
import { encryptAccountNumber } from "@/lib/crypto/account-cipher";
import { BANK_CODES } from "@/lib/bank/codes";

const groupIdSchema = z.string().uuid();

// Buffer → Postgres bytea hex escape (`\x..`). createGroup 의 동일 변환과 정렬.
function toPgByteaHex(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

const updateAccountInputSchema = z.object({
  groupId: z.string().uuid(),
  bankCode: z.enum(BANK_CODES),
  accountHolder: z.string().min(1).max(30),
  accountNumber: z.string().regex(/^[0-9]{8,16}$/),
});

export type UpdateGroupAccountInput = z.infer<typeof updateAccountInputSchema>;

// PRD §3.4 / ADR-0003 lazy 입력. RLS(`groups_update_owner`)가 owner 외를 42501 거부.
// 평문 accountNumber 는 본 함수 안에서만 존재. AES-256-GCM 후 bytea 저장, last4 만 평문 컬럼.
export const updateGroupAccount = withUser<UpdateGroupAccountInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = updateAccountInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const { groupId, bankCode, accountHolder, accountNumber } = parsed.data;
    const encryptedHex = toPgByteaHex(encryptAccountNumber(accountNumber));
    const last4 = accountNumber.slice(-4);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .update({
        bank_code: bankCode,
        account_holder: accountHolder,
        account_number_encrypted: encryptedHex,
        account_number_last4: last4,
      })
      .eq("id", groupId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("forbidden");

    return success({ id: data.id as string });
  },
);

export const renameGroup = withUser<RenameGroupInput, { id: string; name: string }>(
  async (user, input): Promise<ActionResult<{ id: string; name: string }>> => {
    const parsed = renameGroupInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const { groupId, name } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .update({ name })
      .eq("id", groupId)
      .eq("owner_id", user.id)
      .select("id, name")
      .maybeSingle();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("forbidden");

    return success({ id: data.id as string, name: data.name as string });
  },
);

export const deleteGroup = withUser<string, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = groupIdSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const groupId = parsed.data;
    const supabase = await createClient();
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, owner_id")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) return failure(mapSupabaseError(groupError));
    if (!group) return failure("not_found");
    if (group.owner_id !== user.id) return failure("forbidden");

    const { count: memberCount, error: memberError } = await supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId);
    if (memberError) return failure(mapSupabaseError(memberError));
    if ((memberCount ?? 0) !== 1) {
      return failure("invalid_input", {
        groupId: ["친구와 함께한 그룹은 삭제할 수 없어요"],
      });
    }

    const { count: challengeCount, error: challengeError } = await supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId);
    if (challengeError) return failure(mapSupabaseError(challengeError));
    if ((challengeCount ?? 0) > 0) {
      return failure("invalid_input", {
        groupId: ["한 번이라도 챌린지를 시작한 그룹은 삭제할 수 없어요"],
      });
    }

    const { error: deleteError } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId)
      .eq("owner_id", user.id);

    if (deleteError) return failure(mapSupabaseError(deleteError));
    return success({ id: groupId });
  },
);

// PRD §3.3 AC-2 · BE_SCHEMA §8.2.
// 72h 만료는 invites.expires_at DEFAULT 가 보장 (0001_init.sql:48).
// RLS invites_insert_owner 가 오너 외 호출을 42501 로 거부.
export const createInvite = withUser<string, { token: string }>(
  async (user, groupId): Promise<ActionResult<{ token: string }>> => {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return validationFailure(parsed.error);

    const token = generateInviteToken();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invites")
      .insert({
        group_id: parsed.data,
        token,
        created_by: user.id,
      })
      .select("token")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data?.token) return failure("upstream_error");

    void track({ name: "invite_sent", props: { groupId: parsed.data } }, { userId: user.id });

    return success({ token: data.token });
  },
);
