import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { toKstDayKey } from "@/lib/challenge/done-days";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "./_components/action-form";
import { MarkActionStartedOnMount } from "./_components/mark-action-started-on-mount";

type Params = Promise<{ id: string }>;

// 모킹업 §10 — AI 운동일기 + 결과 모달. ADR-0002에 따라 /action → /challenge/[id]/action sub-route.
// RLS al_insert_active_period 가 active/기간/멤버십 강제. 페이지는 challengeId 검증 + 권한 확인.
// PRD §6.2 — 진입 시 그룹원에게 시작 알림(markActionStarted) 자동 발화. server 측
// idempotency 가 "1일 1회"를 보장한다. 발화는 MarkActionStartedOnMount(클라이언트
// mount 시 1회) 로 위임 — 과거 page 본문에서 fire-and-forget 으로 호출하던 시절
// RSC prefetch · HMR · RSC payload 재요청마다 withUser→auth.getUser 가 다중
// 호출되며 GoTrue `over_request_rate_limit` (429) 의 메인 기여자가 되어 분리.
export default async function ChallengeActionPage({ params }: { params: Params }) {
  const { id } = await params;

  const user = await requireUser();
  const supabase = await createClient();

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const isParticipant = detail.members.some((m) => m.id === user.id);
  if (!isParticipant || detail.status !== "active") {
    redirect(`/challenge/${id}`);
  }

  // 같은 날 N개 피드는 등록 가능하지만 인증은 1회만 카운트 — 기대치 정렬용 배너 신호.
  const { data: latestLog } = await supabase
    .from("action_logs")
    .select("created_at")
    .eq("challenge_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const verifiedToday = latestLog
    ? toKstDayKey(latestLog.created_at) === toKstDayKey(new Date())
    : false;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <MarkActionStartedOnMount challengeId={id} />
      <header className="flex flex-col gap-1">
        <p className="t-caption text-muted-foreground">{detail.title}</p>
        <h1 className="t-h2">AI 운동일기</h1>
      </header>
      <ActionForm challengeId={id} verifiedToday={verifiedToday} />
    </div>
  );
}
