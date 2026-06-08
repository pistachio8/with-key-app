// 포인트 잔액 read — 잔액 = Σdelta (balance 컬럼 참조 금지, AC-deposit-hold-5 / ADR-0032).
// SoT 집계는 @withkey/domain 의 pointBalanceFor 를 재사용한다(web·RN 공유 단일 산식).
// RLS(point_ledger_select_self_or_group)가 본인·그룹 멤버 read 를 보장하므로 viewer 토큰으로 안전.
import { createClient } from "@/lib/supabase/server";
import { pointBalanceFor, type PointLedgerEntry } from "@withkey/domain";

export type PointBalanceScope = { userId: string; groupId: string };

// point_ledger 는 0042 신규 테이블이라 생성 DB 타입(supabase.ts)이 아직 미반영(db:types 는 머지 후
// --linked 재생성). untyped client 결과를 명시 shape 로 좁혀 any 전파를 막는다.
type LedgerRow = { user_id: string; group_id: string; delta: number };

/** 한 사용자의 그룹 내 적립 포인트 잔액 = Σdelta. */
export async function getUserPointBalance(scope: PointBalanceScope): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("user_id, group_id, delta")
    .eq("user_id", scope.userId)
    .eq("group_id", scope.groupId);
  if (error) throw error;

  const entries: PointLedgerEntry[] = ((data ?? []) as LedgerRow[]).map((r) => ({
    userId: r.user_id,
    groupId: r.group_id,
    delta: Number(r.delta),
  }));
  return pointBalanceFor(entries, scope);
}

/** 그룹 전체 원장 잔액 = Σdelta(그룹 스코프). 멤버 투명성 read. */
export async function getGroupPointBalance(groupId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("delta")
    .eq("group_id", groupId);
  if (error) throw error;

  return ((data ?? []) as Array<{ delta: number }>).reduce((sum, r) => sum + Number(r.delta), 0);
}
