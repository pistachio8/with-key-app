import "server-only";
import type { MyGroupSummary } from "@withkey/domain";
import { createClient } from "@/lib/supabase/server";

// view-model 계약 SoT 는 @withkey/domain read-contracts (EVAL-0016 · ADR-0037).
export type { MyGroupSummary };

// AppHeader chevron-down sheet (F15) 용 — 활성 그룹만, created_at 내림차순.
// RLS(`groups_select_member`)가 비멤버를 자동 필터링하므로 userId 인자는 불필요.
export async function fetchMyGroups(): Promise<MyGroupSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .is("disbanded_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((g) => ({ id: g.id as string, name: g.name as string | null }));
}
