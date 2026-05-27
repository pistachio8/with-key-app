import { cache } from "react";
import { countDoneDaysByUser } from "@/lib/challenge/done-days";
import { createClient } from "@/lib/supabase/server";

export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
};

export type ChallengeGroupView = {
  id: string;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

export type ChallengeDetailView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  status: "pending" | "accepted" | "active" | "closed";
  startAt: string | null;
  endAt: string | null;
  members: ChallengeMemberView[];
  potTotal: number;
  group: ChallengeGroupView;
  // 코호트 분리(솔로 1 / 그룹 ≥2) + UI 분기 — PR-2.
  // = members.length 와 동일 (시드 후 freeze).
  participantCount: number;
};

export const fetchChallengeDetail = cache(
  async (challengeId: string): Promise<ChallengeDetailView | null> => {
    const supabase = await createClient();
    // D-016: groups 계좌 필드는 마스킹·표시용 3개만 SELECT. 암호문(account_number_encrypted)
    // 은 revealAccountNumber Server Action 한 경로로만 조회.
    const { data: c, error } = await supabase
      .from("challenges")
      .select(
        "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, group_id, groups!inner(id, owner_id, bank_code, account_holder, account_number_last4)",
      )
      .eq("id", challengeId)
      .maybeSingle();
    // error 와 "row 없음" 을 같은 null 로 fold 하면 페이지가 notFound() → 404 로
    // 처리해 실제 원인(429 카스케이드 · 권한/스키마 drift · 네트워크)이 stack
    // 없이 사라진다. error 는 throw 로 surface 시키고, 진짜 "row 없음" 만 null.
    if (error) {
      console.error("[fetchChallengeDetail] supabase error", { challengeId, error });
      throw new Error(`fetchChallengeDetail(${challengeId}) failed: ${error.message}`);
    }
    if (!c) return null;

    const groupRow = Array.isArray(c.groups) ? c.groups[0] : c.groups;

    const { data: parts } = await supabase
      .from("challenge_participants")
      .select("user_id, signed_at, users!inner(display_name)")
      .eq("challenge_id", challengeId);

    const { data: logs } = await supabase
      .from("action_logs")
      .select("user_id, created_at")
      .eq("challenge_id", challengeId);
    // 하루 N개 피드도 인증은 1회 — KST 자정 기준 distinct day count.
    const counts = countDoneDaysByUser(logs ?? []);

    const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      return {
        id: p.user_id,
        displayName: u?.display_name ?? "익명",
        doneCount: counts.get(p.user_id) ?? 0,
        signed: p.signed_at != null,
      };
    });

    return {
      id: c.id,
      title: c.title,
      goalCount: c.goal_count,
      durationDays: c.duration_days,
      penaltyAmount: c.penalty_amount,
      status: c.status as ChallengeDetailView["status"],
      startAt: c.start_at,
      endAt: c.end_at,
      members,
      potTotal: members.length * c.penalty_amount,
      participantCount: members.length,
      group: {
        id: groupRow?.id ?? c.group_id,
        ownerId: groupRow?.owner_id ?? "",
        bankCode: groupRow?.bank_code ?? null,
        accountHolder: groupRow?.account_holder ?? null,
        accountNumberLast4: groupRow?.account_number_last4 ?? null,
      },
    };
  },
);
