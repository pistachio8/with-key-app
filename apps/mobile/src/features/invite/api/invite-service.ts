// RN invite 수락 orchestration (EVAL-0013, 04 §4 A7) — accept_invite 는 RLS-safe
// SECURITY DEFINER RPC(0028) 라 클라이언트가 직접 호출한다 (web /auth/callback 의존 제거).
// 만료·중복·꽉참 판정은 전부 RPC 안 — 여기서는 에러 코드 매핑과 착지 분기만 한다.
import { getSupabaseClient } from "@/services/supabase/client";

export type InviteErrorCode =
  // P0002 — invite not found / expired. 존재 여부를 가르지 않는 건 web 과 동일(토큰 추측 방지).
  | "invalid_or_expired"
  // 42501 'group full' — PRD §3.3 AC-4: 그룹 멤버 최대 4명, 5명째 차단.
  | "group_full"
  | "accept_failed";

export type InviteRedirect =
  | { kind: "pledge"; challengeId: string }
  | { kind: "challenge"; challengeId: string }
  | { kind: "home" };

export type InviteAcceptResult =
  | { ok: true; groupId: string; redirect: InviteRedirect }
  | { ok: false; error: InviteErrorCode };

function mapAcceptError(error: { code?: string | null; message?: string | null }): InviteErrorCode {
  if (error.code === "P0002") return "invalid_or_expired";
  if (error.code === "42501" && (error.message ?? "").includes("group full")) return "group_full";
  return "accept_failed";
}

export async function acceptInvite(token: string): Promise<InviteAcceptResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });

  if (error) {
    // token 본문은 로그 금지 — 코드/메시지만 남긴다.
    console.error("[invite] accept_invite failed:", error.code, error.message);
    return { ok: false, error: mapAcceptError(error) };
  }
  if (typeof data !== "string") {
    return { ok: false, error: "accept_failed" };
  }

  // already-joined 도 RPC 가 성공으로 수렴(멤버 insert 는 idempotent) — 동일 착지 규칙.
  // web invite/_actions.ts 와 같은 분기: pending → 서약 서명, active → 진행 중 챌린지, 없으면 홈.
  const { data: latest } = await supabase
    .from("challenges")
    .select("id, status")
    .eq("group_id", data)
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();

  const redirect: InviteRedirect =
    latest?.status === "pending"
      ? { kind: "pledge", challengeId: latest.id }
      : latest?.status === "active"
        ? { kind: "challenge", challengeId: latest.id }
        : { kind: "home" };

  return { ok: true, groupId: data, redirect };
}
